import { lazy, Suspense, useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocket } from './hooks/useSocket'
import { AdminPanel } from './admin/AdminPanel'
import { useWorldStore } from './stores/worldStore'
import type { HandoutAsset } from './stores/worldStore'
import { useIdentityStore } from './stores/identityStore'
import { useUiStore } from './stores/uiStore'
import {
  selectActiveScene,
  selectIsTactical,
  selectTacticalInfo,
  selectTokens,
  deriveSeatProperties,
  selectSpeakerEntities,
} from './stores/selectors'
import { roleStore } from './shared/roleState'
import { SeatSelect } from './identity/SeatSelect'
import { ChatPanel } from './chat/ChatPanel'
import { SceneViewer } from './scene/SceneViewer'
import { AmbientAudio } from './scene/AmbientAudio'
import { TacticalPanel } from './combat/TacticalPanel'
import type { KonvaMapHandle } from './combat/TacticalPanel'
import { TacticalToolbar } from './combat/TacticalToolbar'
import { useTacticalKeyboard } from './combat/hooks/useTacticalKeyboard'
import { GmDock } from './gm/GmDock'
import { GmSidebar } from './gm/GmSidebar'

import { SceneButton } from './gm/SceneButton'
import { HamburgerMenu } from './layout/HamburgerMenu'
import { PortraitBar } from './layout/PortraitBar'
import { MyCharacterCard } from './layout/MyCharacterCard'
import * as Popover from '@radix-ui/react-popover'
import { PopoverContent } from './ui/primitives/PopoverContent'
import { ShowcaseOverlay } from './showcase/ShowcaseOverlay'
import type { ShowcaseItem } from './shared/showcaseTypes'
import type { Entity, Atmosphere, SceneEntityEntry } from './shared/entityTypes'
import { HandoutEditModal } from './dock/HandoutEditModal'
import { generateTokenId } from './shared/idUtils'
import { ToastProvider } from './ui/ToastProvider'
import { initWorkflowSystem, startWorkflowTriggers } from './workflow/useWorkflowSDK'
import { useStore } from 'zustand'
import { RegionRenderer } from './ui-system/RegionRenderer'
import { OnDemandHost } from './ui-system/OnDemandHost'
import { LayerRenderer } from './ui-system/LayerRenderer'
import { InputHandlerHost } from './ui-system/InputHandlerHost'
import { getLayoutStore } from './stores/layoutStore'
import { getUIRegistry, createRegionSDK } from './ui-system/uiSystemInit'
import { PortalManager } from './ui-system/portalManager'
import type { AnchorPoint, IRegionSDK } from './ui-system/types'
import { useLayoutSync } from './ui-system/useLayoutSync'

// DEV-only: Sandbox pattern library. Vite replaces import.meta.env.DEV with
// false in production builds, making the lazy import dead code that Rollup
// eliminates entirely (along with the whole src/sandbox/ directory).
const SandboxRoot = import.meta.env.DEV ? lazy(() => import('./sandbox/index')) : () => null
const PocApp = import.meta.env.DEV ? lazy(() => import('../poc/PocApp')) : () => null
const DebugLogPage = import.meta.env.DEV ? lazy(() => import('./debug/DebugLogPage')) : () => null

const EMPTY_ENTRIES: SceneEntityEntry[] = []

function RoomSession({ roomId }: { roomId: string }) {
  const { t } = useTranslation('common')
  const { socket, connectionStatus } = useSocket(roomId)
  const [isLoading, setIsLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const konvaMapRef = useRef<KonvaMapHandle>(null)

  // Initialize stores with Socket.io
  const initWorld = useWorldStore((s) => s.init)
  const reinitWorld = useWorldStore((s) => s.reinit)
  const initIdentity = useIdentityStore((s) => s.init)

  useEffect(() => {
    if (!socket) return
    cancelledRef.current = false
    let cleanupWorld: (() => void) | undefined
    let cleanupIdentity: (() => void) | undefined
    let cleanupTriggers: (() => void) | undefined
    let cleanupSeatWatch: (() => void) | undefined

    // Phase 1: Construct workflow system (sync — no data dependencies)
    const { cleanup: cleanupWorkflow } = initWorkflowSystem()

    void (async () => {
      try {
        setInitError(null)

        // Phase 2: Load store data (world + identity in parallel)
        const [worldCleanup, identityCleanup] = await Promise.all([
          initWorld(roomId, socket),
          initIdentity(roomId, socket),
        ])
        if (cancelledRef.current) {
          worldCleanup()
          identityCleanup()
          return
        }
        cleanupWorld = worldCleanup
        cleanupIdentity = identityCleanup

        // Capture watermark before any log:new events can push it higher.
        // JS is single-threaded — no socket events fire between await resume and this read.
        const historyWatermark = useWorldStore.getState().logWatermark

        // Phase 3: Plugin onReady + trigger subscription.
        // Deferred until seat is claimed — plugin onReady may create entities
        // (e.g. FearManager.ensureEntity) which requires socket.data.seatId on server.
        // For returning users (auto-claim from cache), mySeatId is already set here.
        // For new users, triggers start after they pick a seat in SeatSelect.
        const startTriggers = async () => {
          if (cancelledRef.current) return
          try {
            cleanupTriggers = await startWorkflowTriggers(historyWatermark)
          } catch (triggerErr) {
            if (triggerErr instanceof AggregateError && 'cleanup' in triggerErr) {
              cleanupTriggers = (triggerErr as AggregateError & { cleanup: () => void }).cleanup
            }
            console.warn('[Room] Some plugins failed onReady (non-fatal):', triggerErr)
          }
        }

        if (useIdentityStore.getState().mySeatId) {
          // Seat already claimed (auto-claim from sessionStorage) — start immediately.
          // Socket.io guarantees ordering: seat:claim was emitted during initIdentity,
          // so server has seatId by the time onReady sends entity:create-request.
          await startTriggers()
        } else {
          // No seat yet — subscribe and start triggers when seat is claimed.
          const unsub = useIdentityStore.subscribe((state) => {
            if (state.mySeatId && !cancelledRef.current) {
              unsub()
              void startTriggers()
            }
          })
          cleanupSeatWatch = unsub
        }

        setIsLoading(false)
      } catch (err) {
        console.error('Failed to initialize room:', err)
        setInitError(err instanceof Error ? err.message : 'Connection failed')
        setIsLoading(false)
      }
    })()

    return () => {
      cancelledRef.current = true
      cleanupSeatWatch?.()
      cleanupTriggers?.()
      cleanupWorkflow()
      cleanupWorld?.()
      cleanupIdentity?.()
      setIsLoading(true)
    }
  }, [socket, roomId, initWorld, initIdentity])

  // Reinit on reconnect
  useEffect(() => {
    if (connectionStatus === 'connected' && !isLoading) {
      reinitWorld()
        .then(() => {
          setInitError(null)
        })
        .catch((err: unknown) => {
          console.error('Failed to reinitialize after reconnect:', err)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus])

  // World store subscriptions
  const room = useWorldStore((s) => s.room)
  const scenes = useWorldStore((s) => s.scenes)
  const entities = useWorldStore((s) => s.entities)
  const tokens = useWorldStore(selectTokens)
  const handoutAssets = useWorldStore((s) => s.handoutAssets)
  const activeScene = useWorldStore(selectActiveScene)
  const isTactical = useWorldStore(selectIsTactical)
  const tacticalInfo = useWorldStore(selectTacticalInfo)

  // Tactical keyboard shortcuts
  useTacticalKeyboard({ mapRef: konvaMapRef, enabled: isTactical })

  // World store actions
  const setActiveScene = useWorldStore((s) => s.setActiveScene)
  const addScene = useWorldStore((s) => s.addScene)
  const updateScene = useWorldStore((s) => s.updateScene)
  const deleteSceneRaw = useWorldStore((s) => s.deleteScene)
  const addEntityToScene = useWorldStore((s) => s.addEntityToScene)
  const removeEntityFromScene = useWorldStore((s) => s.removeEntityFromScene)
  const enterTactical = useWorldStore((s) => s.enterTactical)
  const exitTactical = useWorldStore((s) => s.exitTactical)
  const setTacticalMapUrl = useWorldStore((s) => s.setTacticalMapUrl)
  const duplicateScene = useWorldStore((s) => s.duplicateScene)
  const addEntity = useWorldStore((s) => s.addEntity)
  const updateEntity = useWorldStore((s) => s.updateEntity)
  const placeEntityOnMap = useWorldStore((s) => s.placeEntityOnMap)
  const addToken = useWorldStore((s) => s.addToken)
  const updateToken = useWorldStore((s) => s.updateToken)
  const deleteToken = useWorldStore((s) => s.deleteToken)
  const addShowcaseItem = useWorldStore((s) => s.addShowcaseItem)
  const addHandoutAsset = useWorldStore((s) => s.addHandoutAsset)
  const updateHandoutAsset = useWorldStore((s) => s.updateHandoutAsset)
  const deleteHandoutAsset = useWorldStore((s) => s.deleteHandoutAsset)
  // Identity store subscriptions
  const seats = useIdentityStore((s) => s.seats)
  const mySeatId = useIdentityStore((s) => s.mySeatId)
  const onlineSeatIds = useIdentityStore((s) => s.onlineSeatIds)
  const getMySeat = useIdentityStore((s) => s.getMySeat)
  const mySeat = getMySeat()

  // Identity store actions
  const claimSeat = useIdentityStore((s) => s.claimSeat)
  const createSeat = useIdentityStore((s) => s.createSeat)
  const deleteSeat = useIdentityStore((s) => s.deleteSeat)
  const leaveSeat = useIdentityStore((s) => s.leaveSeat)
  const updateSeat = useIdentityStore((s) => s.updateSeat)

  // UI store
  const openCardId = useUiStore((s) => s.openCardId)
  const closeCard = useUiStore((s) => s.closeCard)
  const closePinnedCard = useUiStore((s) => s.closePinnedCard)
  const selectedTokenIds = useUiStore((s) => s.selectedTokenIds)
  const primarySelectedTokenId = useUiStore((s) => s.primarySelectedTokenId)
  const bgContextMenu = useUiStore((s) => s.bgContextMenu)
  const editingHandout = useUiStore((s) => s.editingHandout)
  const selectToken = useUiStore((s) => s.selectToken)
  const clearSelection = useUiStore((s) => s.clearSelection)
  const toggleSelection = useUiStore((s) => s.toggleSelection)

  // ── UI System: plugin panels + layout ──
  // Hooks must be before early returns to satisfy Rules of Hooks
  const isGM = mySeat?.role === 'GM'
  const layoutStore = useMemo(() => getLayoutStore(), [])
  const uiRegistry = useMemo(() => getUIRegistry(), [])
  const activeLayout = useStore(layoutStore, (s) => s.activeLayout)
  const layoutMode = useStore(layoutStore, (s) => s.layoutMode)
  const onDemandInstances = useStore(layoutStore, (s) => s.onDemandInstances)

  // Viewport tracking for anchor-based layout
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    const handler = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('resize', handler)
    }
  }, [])

  // Portal manager for Radix/floating UI containers
  const [portalManager] = useState(() => new PortalManager())
  useEffect(() => {
    return () => {
      portalManager.dispose()
    }
  }, [portalManager])

  // Sync layoutStore.isTactical with worldStore tactical state
  useEffect(() => {
    layoutStore.getState().setIsTactical(isTactical)
  }, [isTactical, layoutStore])

  // Auto-populate layout entries for persistent regions with defaultPlacement.
  // Runs after every loadLayout (including socket layout:update). Stabilizes in 2 cycles:
  // cycle 1 adds missing entries → activeLayout changes → cycle 2 finds all entries exist → done.
  useEffect(() => {
    if (Object.keys(activeLayout).length === 0) return

    for (const def of uiRegistry.listRegionsByLifecycle('persistent')) {
      if (!def.defaultPlacement) continue
      const exists = Object.keys(activeLayout).some(
        (k) => k === def.id || k.startsWith(def.id + '#'),
      )
      if (!exists) {
        layoutStore.getState().addEntry(def.id, {
          anchor: def.defaultPlacement.anchor,
          offsetX: def.defaultPlacement.offsetX ?? 0,
          offsetY: def.defaultPlacement.offsetY ?? 0,
          width: def.defaultSize.width,
          height: def.defaultSize.height,
          zOrder: 0,
        })
      }
    }
  }, [activeLayout, uiRegistry, layoutStore])

  // Debounced layout persistence
  useLayoutSync(layoutStore, roomId, !!socket)

  // Anchor-based drag/resize handlers for edit mode
  const handleDragEnd = useCallback(
    (instanceKey: string, placement: { anchor: AnchorPoint; offsetX: number; offsetY: number }) => {
      layoutStore.getState().updateEntry(instanceKey, placement)
    },
    [layoutStore],
  )

  const handleResize = useCallback(
    (instanceKey: string, size: { width: number; height: number }) => {
      layoutStore.getState().updateEntry(instanceKey, size)
    },
    [layoutStore],
  )

  // Region SDK factory for RegionRenderer + OnDemandHost
  const makeRegionSDK = useCallback(
    (instanceKey: string, instanceProps: Record<string, unknown>): IRegionSDK => {
      const regionId = instanceKey.replace(/#[^#]*$/, '')
      const def = uiRegistry.getRegion(regionId)

      // Ensure portal container exists
      if (!portalManager.getPortal(instanceKey)) {
        portalManager.createPortal(instanceKey, def?.layer ?? 'standard')
      }

      return createRegionSDK({
        instanceKey,
        instanceProps,
        role: isGM ? 'GM' : 'Player',
        layoutMode,
        read: {
          entity: (id) => (id ? entities[id] : undefined),
          component: () => undefined,
          query: () => Object.values(entities),
          formulaTokens: () => ({}),
        },
        workflow: { runWorkflow: () => Promise.resolve({} as never) },
        awarenessManager: null,
        layoutActions: {
          openPanel: (componentId, props, _position) => {
            const regDef = uiRegistry.getRegion(componentId)
            if (!regDef) return ''

            if (regDef.lifecycle === 'persistent') {
              layoutStore.getState().updateEntry(componentId, { visible: true })
              return componentId
            }

            // On-demand: create ephemeral instance
            const key = `${componentId}#${Date.now().toString(36)}`
            layoutStore.getState().openOnDemand(componentId, key, props ?? {})
            return key
          },
          closePanel: (key) => {
            if (key.includes('#')) {
              layoutStore.getState().closeOnDemand(key)
              portalManager.removePortal(key)
            } else {
              layoutStore.getState().updateEntry(key, { visible: false })
            }
          },
        },
        logSubscribe: null,
        onResize: (size) => {
          layoutStore.getState().updateEntry(instanceKey, size)
        },
        getPortalContainer: () => {
          return portalManager.getPortal(instanceKey) ?? document.body
        },
        minSize: def?.minSize,
        getEntities: () => useWorldStore.getState().entities,
        getLogEntries: () => useWorldStore.getState().logEntries,
        storeSubscribe: useWorldStore.subscribe,
      })
    },
    [isGM, layoutMode, entities, layoutStore, uiRegistry, portalManager],
  )
  const setSelectedTokenIds = useUiStore((s) => s.setSelectedTokenIds)
  const setBgContextMenu = useUiStore((s) => s.setBgContextMenu)
  const setEditingHandout = useUiStore((s) => s.setEditingHandout)

  // Sync role from seat
  const mySeatRole = mySeat?.role
  useEffect(() => {
    if (mySeatRole) roleStore.set(mySeatRole)
  }, [mySeatRole])

  // Auto-set activeCharacterId if seat has an owned entity but no active one
  useEffect(() => {
    if (!mySeat || !mySeatId) return
    if (mySeat.activeCharacterId) return
    const ownedEntity = Object.values(entities).find(
      (e) => e.permissions.seats[mySeatId] === 'owner',
    )
    if (ownedEntity) {
      void updateSeat(mySeatId, { activeCharacterId: ownedEntity.id })
    }
  }, [mySeat, mySeatId, entities, updateSeat])

  // Entity lookup (O(1) from Record)
  const getEntity = (id: string | null): Entity | null => {
    if (!id) return null
    return entities[id] ?? null
  }

  const activeEntity = getEntity(mySeat?.activeCharacterId ?? null)
  const selectedToken = isTactical
    ? (tokens.find((t) => t.id === primarySelectedTokenId) ?? null)
    : null
  const selectedTokenEntity = selectedToken?.entityId ? getEntity(selectedToken.entityId) : null

  const seatProperties = deriveSeatProperties(activeEntity, selectedTokenEntity)
  const isGMForSpeakers = mySeat?.role === 'GM'
  const speakerEntities = useMemo(
    () => selectSpeakerEntities(entities, mySeatId, isGMForSpeakers),
    [entities, mySeatId, isGMForSpeakers],
  )

  const sceneEntityEntries =
    useWorldStore((s) => (room.activeSceneId ? s.sceneEntityMap[room.activeSceneId] : undefined)) ??
    EMPTY_ENTRIES
  const sceneEntityIds = useMemo(
    () => sceneEntityEntries.map((e) => e.entityId),
    [sceneEntityEntries],
  )

  // Convert Record types to arrays for components that still expect arrays
  const entitiesArray = useMemo(() => Object.values(entities), [entities])

  // Default scene is created server-side in POST /api/rooms (rooms.ts).
  // No client-side auto-create needed.

  if (isLoading || initError) {
    return (
      <div
        data-testid="connecting-screen"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'sans-serif',
          fontSize: 18,
          color: initError ? '#f87171' : '#666',
          background: '#1a1a2e',
          gap: 16,
        }}
      >
        {initError ? (
          <>
            <div>{t('connection_failed', { error: initError })}</div>
            <button
              onClick={() => {
                window.location.reload()
              }}
              style={{
                padding: '8px 24px',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {t('retry')}
            </button>
          </>
        ) : (
          t('connecting')
        )}
      </div>
    )
  }

  if (!mySeat || !mySeatId) {
    return (
      <SeatSelect
        seats={seats}
        onlineSeatIds={onlineSeatIds}
        onClaim={claimSeat}
        onCreate={(name, role, color) => {
          void createSeat(name, role, color)
        }}
        onDelete={(seatId) => {
          void deleteSeat(seatId)
        }}
      />
    )
  }

  const handleRemoveFromScene = (entityId: string) => {
    if (room.activeSceneId) void removeEntityFromScene(room.activeSceneId, entityId)
    if (openCardId === entityId) closeCard()
    closePinnedCard(entityId)
  }

  const handleDeleteScene = (sceneId: string) => {
    void deleteSceneRaw(sceneId)
    // Orphan GC is now handled server-side
  }

  const handleAddScene = (id: string, name: string, atmosphere: Atmosphere) => {
    // Server auto-links persistent entities on scene creation
    void addScene(id, name, atmosphere)
  }

  const handleAddEntity = (entity: Entity) => {
    void addEntity(entity)
    // Server handles adding persistent entities to all scenes
  }

  const handleUpdateEntity = (id: string, updates: Partial<Entity>) => {
    void updateEntity(id, updates)
    // Server handles persistent→all-scenes linking
  }

  const handleSetActiveCharacter = (entityId: string) => {
    if (mySeatId) {
      void updateSeat(mySeatId, { activeCharacterId: entityId })
    }
  }

  const handleShowcaseHandout = (asset: HandoutAsset) => {
    const item: ShowcaseItem = {
      id: generateTokenId(),
      type: 'image',
      title: asset.title,
      description: asset.description,
      imageUrl: asset.imageUrl,
      senderId: mySeatId,
      senderName: mySeat.name,
      senderColor: mySeat.color,
      ephemeral: false,
      timestamp: Date.now(),
    }
    void addShowcaseItem(item)
  }

  const handleBgContextMenu = (e: React.MouseEvent) => {
    if (!isGM) return
    e.preventDefault()
    setBgContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleAddNpc = () => {
    setBgContextMenu(null)
    void useWorldStore
      .getState()
      .createEphemeralNpcInScene()
      .then((entity) => {
        if (entity) useUiStore.getState().openCard(entity.id)
      })
  }

  const handleDropEntityOnMap = (entityId: string, mapX: number, mapY: number) => {
    void placeEntityOnMap(entityId, mapX, mapY)
  }

  return (
    <ToastProvider>
      <div>
        <SceneViewer scene={activeScene} blurred={isTactical} onContextMenu={handleBgContextMenu} />
        <AmbientAudio
          audioUrl={activeScene?.atmosphere.ambientAudioUrl}
          volume={activeScene?.atmosphere.ambientAudioVolume ?? 0.5}
        />

        {activeScene && (
          <TacticalPanel
            ref={konvaMapRef}
            tacticalInfo={tacticalInfo}
            tokens={tokens}
            getEntity={getEntity}
            mySeatId={mySeatId}
            role={mySeat.role}
            selectedTokenIds={selectedTokenIds}
            primarySelectedTokenId={primarySelectedTokenId}
            onSelectToken={selectToken}
            onToggleSelection={toggleSelection}
            onClearSelection={clearSelection}
            onSetSelectedTokenIds={setSelectedTokenIds}
            onUpdateToken={(id, updates) => {
              void updateToken(id, updates)
            }}
            onDeleteToken={(id) => {
              void deleteToken(id)
            }}
            onAddToken={(token) => {
              void addToken(token)
            }}
            onDropEntityOnMap={handleDropEntityOnMap}
            onContextMenu={handleBgContextMenu}
            visible={isTactical}
          />
        )}

        {/* Top-left: Hamburger menu */}
        <HamburgerMenu
          mySeat={mySeat}
          onUpdateSeat={(seatId, updates) => {
            void updateSeat(seatId, updates)
          }}
          onLeaveSeat={leaveSeat}
        />

        {/* Top-center: Portrait bar */}
        <PortraitBar
          entities={entitiesArray}
          sceneEntityIds={sceneEntityIds}
          sceneEntityEntries={sceneEntityEntries}
          activeSceneId={room.activeSceneId}
          mySeatId={mySeatId}
          role={mySeat.role}
          isGM={isGM}
          onlineSeatIds={onlineSeatIds}
          activeCharacterId={mySeat.activeCharacterId ?? null}
          onSetActiveCharacter={handleSetActiveCharacter}
          onRemoveFromScene={handleRemoveFromScene}
          onUpdateEntity={handleUpdateEntity}
          isTactical={isTactical}
          tacticalInfo={tacticalInfo}
        />

        {/* Right: Tactical toolbar (only in tactical mode) */}
        {isTactical && tacticalInfo && (
          <TacticalToolbar mapRef={konvaMapRef} role={mySeat.role} tacticalInfo={tacticalInfo} />
        )}

        {/* Left: GM sidebar or player character card */}
        {isGM ? (
          <GmSidebar />
        ) : (
          activeEntity && (
            <MyCharacterCard entity={activeEntity} onUpdateEntity={handleUpdateEntity} />
          )
        )}

        {/* Center: Showcase spotlight overlay */}
        <ShowcaseOverlay roomId={roomId} isGM={isGM} />

        {/* Bottom-right: Chat overlay */}
        <ChatPanel
          senderId={mySeatId}
          senderName={mySeat.name}
          senderColor={mySeat.color}
          seatProperties={seatProperties}
          speakerEntities={speakerEntities}
        />

        {/* Bottom center: GM Dock (unified toolbar) */}
        {isGM && (
          <GmDock
            activeSceneId={room.activeSceneId}
            isTactical={isTactical}
            onUpdateScene={(id, updates) => {
              void updateScene(id, updates)
            }}
            onToggleCombat={() => {
              if (isTactical) {
                void exitTactical()
              } else {
                void enterTactical()
              }
            }}
            onShowcaseImage={(imageUrl) => {
              void addShowcaseItem({
                id: crypto.randomUUID(),
                type: 'image',
                imageUrl,
                senderId: mySeatId,
                senderName: mySeat.name,
                senderColor: mySeat.color,
                ephemeral: false,
                timestamp: Date.now(),
              })
            }}
            entities={entitiesArray}
            onAddEntity={handleAddEntity}
            onAddEntityToScene={(entityId) => {
              if (room.activeSceneId) void addEntityToScene(room.activeSceneId, entityId)
            }}
            selectedToken={selectedToken}
            onAddToken={(token) => {
              void addToken(token)
            }}
            onDeleteToken={(id) => {
              void deleteToken(id)
            }}
            onSelectToken={(id) => {
              if (id === null) clearSelection()
              else selectToken(id)
            }}
            handoutAssets={handoutAssets}
            onAddHandoutAsset={addHandoutAsset}
            onEditHandoutAsset={setEditingHandout}
            onDeleteHandoutAsset={deleteHandoutAsset}
            onShowcaseHandout={handleShowcaseHandout}
            onSetAsTacticalMap={(imageUrl: string) => {
              const img = new Image()
              img.onload = () => setTacticalMapUrl(imageUrl, img.naturalWidth, img.naturalHeight)
              img.onerror = () => setTacticalMapUrl(imageUrl, 1920, 1080)
              img.src = imageUrl
            }}
          />
        )}

        {/* Bottom-left: Scene Button (GM only) */}
        {isGM && (
          <SceneButton
            scenes={scenes}
            activeSceneId={room.activeSceneId}
            onSelectScene={(sceneId) => {
              void setActiveScene(sceneId)
            }}
            onRenameScene={(id, name) => {
              void updateScene(id, { name })
            }}
            onDeleteScene={handleDeleteScene}
            onDuplicateScene={(sceneId) => {
              void duplicateScene(sceneId, crypto.randomUUID())
            }}
            onCreateScene={() => {
              handleAddScene(crypto.randomUUID(), 'New Scene', {
                imageUrl: '',
                width: 0,
                height: 0,
                particlePreset: 'none',
                ambientPreset: 'none',
                ambientAudioUrl: '',
                ambientAudioVolume: 0.5,
              })
            }}
          />
        )}

        {/* Background right-click context menu (GM only) */}
        <Popover.Root
          open={bgContextMenu !== null}
          onOpenChange={(open) => {
            if (!open) setBgContextMenu(null)
          }}
        >
          <Popover.Anchor
            className="fixed pointer-events-none w-0 h-0"
            style={{
              left: bgContextMenu?.x ?? 0,
              top: bgContextMenu?.y ?? 0,
            }}
          />
          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={0}
            className="min-w-[160px] rounded-lg bg-glass py-1 backdrop-blur-[16px] px-0"
          >
            <button
              onClick={handleAddNpc}
              className="block w-full px-3.5 py-2 bg-transparent border-none text-xs font-medium text-left font-sans transition-colors duration-100 cursor-pointer hover:bg-hover text-text-primary"
            >
              {t('add_npc')}
            </button>
          </PopoverContent>
        </Popover.Root>

        {editingHandout && (
          <HandoutEditModal
            asset={editingHandout}
            onSave={updateHandoutAsset}
            onClose={() => {
              setEditingHandout(null)
            }}
          />
        )}
      </div>

      {/* UI System: plugin panels rendered via layout */}
      <div className="pointer-events-none fixed inset-0 z-[900]">
        <LayerRenderer registry={uiRegistry} layoutMode={layoutMode} />
        <RegionRenderer
          registry={uiRegistry}
          layout={activeLayout}
          makeSDK={makeRegionSDK}
          viewport={viewport}
          layoutMode={layoutMode}
          onDragEnd={layoutMode === 'edit' ? handleDragEnd : undefined}
          onResize={layoutMode === 'edit' ? handleResize : undefined}
        />
        <OnDemandHost
          registry={uiRegistry}
          instances={onDemandInstances}
          layout={activeLayout}
          makeSDK={makeRegionSDK}
          viewport={viewport}
        />
      </div>

      {/* UI System: input handler overlays (modals, pickers) triggered by requestInput */}
      <InputHandlerHost registry={uiRegistry} />
    </ToastProvider>
  )
}

function useHashRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onHashChange = () => {
      setHash(location.hash)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])
  return hash
}

export default function App() {
  const { t } = useTranslation('common')
  const hash = useHashRoute()

  if (hash === '#admin') {
    return <AdminPanel />
  }

  if (import.meta.env.DEV && hash === '#sandbox') {
    return (
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-deep text-muted">
            Loading sandbox...
          </div>
        }
      >
        <SandboxRoot />
      </Suspense>
    )
  }

  if (import.meta.env.DEV && hash === '#poc') {
    return (
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-deep text-muted">
            Loading POC...
          </div>
        }
      >
        <PocApp />
      </Suspense>
    )
  }

  if (import.meta.env.DEV) {
    const debugMatch = hash.match(/^#debug=([a-zA-Z0-9_-]+)$/)
    if (debugMatch) {
      return (
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center bg-deep text-muted">
              Loading debug…
            </div>
          }
        >
          <DebugLogPage roomId={debugMatch[1] as string} />
        </Suspense>
      )
    }
  }

  const roomMatch = hash.match(/^#room=([a-zA-Z0-9_-]+)$/)
  if (roomMatch) {
    return <RoomSession roomId={roomMatch[1] as string} />
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'sans-serif',
        background: '#0f0f19',
        color: '#e4e4e7',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <h1 style={{ fontSize: 28, marginBottom: 16, fontWeight: 300 }}>{t('app_title')}</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{t('landing_hint')}</p>
        <a
          href="#admin"
          style={{ color: '#60a5fa', fontSize: 13, marginTop: 24, display: 'inline-block' }}
        >
          {t('admin_panel')}
        </a>
      </div>
    </div>
  )
}
