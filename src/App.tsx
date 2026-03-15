import { useEffect, useState, useRef, useMemo } from 'react'
import { useSocket } from './shared/hooks/useSocket'
import { AdminPanel } from './admin/AdminPanel'
import { useWorldStore } from './stores/worldStore'
import type { HandoutAsset } from './stores/worldStore'
import { useIdentityStore } from './stores/identityStore'
import { useUiStore } from './stores/uiStore'
import { useAssetStore } from './stores/assetStore'
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
import { GmDock } from './gm/GmDock'
import { GmSidebar } from './gm/GmSidebar'

import { SceneButton } from './gm/SceneButton'
import { HamburgerMenu } from './layout/HamburgerMenu'
import { PortraitBar } from './layout/PortraitBar'
import { MyCharacterCard } from './layout/MyCharacterCard'
import { ContextMenu } from './shared/ContextMenu'
import { ShowcaseOverlay } from './showcase/ShowcaseOverlay'
import type { ShowcaseItem } from './showcase/showcaseTypes'
import type { Entity, Atmosphere, SceneEntityEntry } from './shared/entityTypes'
import { HandoutEditModal } from './dock/HandoutEditModal'
import { generateTokenId } from './shared/idUtils'
import { TeamDashboard } from './team/TeamDashboard'
import { ToastProvider } from './shared/ui/ToastProvider'

const EMPTY_ENTRIES: SceneEntityEntry[] = []

function RoomSession({ roomId }: { roomId: string }) {
  const { socket, connectionStatus } = useSocket(roomId)
  const [isLoading, setIsLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  // Initialize stores with Socket.io
  const initWorld = useWorldStore((s) => s.init)
  const reinitWorld = useWorldStore((s) => s.reinit)
  const initIdentity = useIdentityStore((s) => s.init)

  useEffect(() => {
    if (!socket) return
    cancelledRef.current = false
    let cleanupWorld: (() => void) | undefined
    let cleanupIdentity: (() => void) | undefined
    ;(async () => {
      try {
        setInitError(null)
        const [worldCleanup, identityCleanup] = await Promise.all([
          initWorld(roomId, socket),
          initIdentity(roomId, socket),
          useAssetStore.getState().init(roomId),
        ])
        if (cancelledRef.current) {
          worldCleanup()
          identityCleanup()
          return
        }
        cleanupWorld = worldCleanup
        cleanupIdentity = identityCleanup
        setIsLoading(false)
      } catch (err) {
        console.error('Failed to initialize room:', err)
        setInitError(err instanceof Error ? err.message : 'Connection failed')
        setIsLoading(false)
      }
    })()

    return () => {
      cancelledRef.current = true
      cleanupWorld?.()
      cleanupIdentity?.()
      setIsLoading(true)
    }
  }, [socket, roomId, initWorld, initIdentity])

  // Reinit on reconnect
  useEffect(() => {
    if (connectionStatus === 'connected' && !isLoading) {
      Promise.all([reinitWorld(), useAssetStore.getState().refresh()])
        .then(() => setInitError(null))
        .catch((err) => {
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
  const inspectedCharacterId = useUiStore((s) => s.inspectedCharacterId)
  const selectedTokenId = useUiStore((s) => s.selectedTokenId)
  const bgContextMenu = useUiStore((s) => s.bgContextMenu)
  const editingHandout = useUiStore((s) => s.editingHandout)
  const setInspectedCharacterId = useUiStore((s) => s.setInspectedCharacterId)
  const setSelectedTokenId = useUiStore((s) => s.setSelectedTokenId)
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
      updateSeat(mySeatId, { activeCharacterId: ownedEntity.id })
    }
  }, [mySeat, mySeatId, entities, updateSeat])

  // Entity lookup (O(1) from Record)
  const getEntity = (id: string | null): Entity | null => {
    if (!id) return null
    return entities[id] ?? null
  }

  const activeEntity = getEntity(mySeat?.activeCharacterId ?? null)
  const selectedToken = isTactical ? (tokens.find((t) => t.id === selectedTokenId) ?? null) : null
  const selectedTokenEntity = selectedToken?.entityId ? getEntity(selectedToken.entityId) : null

  const seatProperties = deriveSeatProperties(activeEntity, selectedTokenEntity)
  const isGMForSpeakers = mySeat?.role === 'GM'
  const speakerEntities = useMemo(
    () => selectSpeakerEntities(entities, mySeatId, isGMForSpeakers ?? false),
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

  // Auto-create a default scene when GM enters a room with no scenes
  const isGMRole = mySeat?.role === 'GM'
  useEffect(() => {
    if (isLoading || !isGMRole) return
    if (scenes.length > 0) return
    if (room.activeSceneId) return
    const id = crypto.randomUUID()
    addScene(id, 'Scene 1', {
      imageUrl: '',
      width: 1920,
      height: 1080,
      particlePreset: 'none',
      ambientPreset: '',
      ambientAudioUrl: '',
      ambientAudioVolume: 0.5,
    })
    setActiveScene(id)
  }, [isLoading, isGMRole, scenes.length, room.activeSceneId, addScene, setActiveScene])

  if (isLoading || initError) {
    return (
      <div
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
            <div>Failed to connect: {initError}</div>
            <button
              onClick={() => window.location.reload()}
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
              Retry
            </button>
          </>
        ) : (
          'Connecting to server...'
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
        onCreate={createSeat}
        onDelete={deleteSeat}
      />
    )
  }

  const isGM = mySeat.role === 'GM'

  const handleRemoveFromScene = (entityId: string) => {
    if (room.activeSceneId) removeEntityFromScene(room.activeSceneId, entityId)
    if (inspectedCharacterId === entityId) setInspectedCharacterId(null)
  }

  const handleDeleteScene = (sceneId: string) => {
    deleteSceneRaw(sceneId)
    // Orphan GC is now handled server-side
  }

  const handleAddScene = (id: string, name: string, atmosphere: Atmosphere) => {
    // Server auto-links persistent entities on scene creation
    addScene(id, name, atmosphere)
  }

  const handleAddEntity = (entity: Entity) => {
    addEntity(entity)
    // Server handles adding persistent entities to all scenes
  }

  const handleUpdateEntity = (id: string, updates: Partial<Entity>) => {
    updateEntity(id, updates)
    // Server handles persistent→all-scenes linking
  }

  const handleSetActiveCharacter = (entityId: string) => {
    if (mySeatId) {
      updateSeat(mySeatId, { activeCharacterId: entityId })
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
    addShowcaseItem(item)
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
        if (entity) setInspectedCharacterId(entity.id)
      })
  }

  const handleDropEntityOnMap = (entityId: string, mapX: number, mapY: number) => {
    placeEntityOnMap(entityId, mapX, mapY)
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
            tacticalInfo={tacticalInfo}
            tokens={tokens}
            getEntity={getEntity}
            mySeatId={mySeatId}
            role={mySeat.role}
            selectedTokenId={selectedTokenId}
            onSelectToken={setSelectedTokenId}
            onUpdateToken={updateToken}
            onDeleteToken={deleteToken}
            onAddToken={addToken}
            onDropEntityOnMap={handleDropEntityOnMap}
            onContextMenu={handleBgContextMenu}
            visible={isTactical}
          />
        )}

        {/* Top-left: Hamburger menu */}
        <HamburgerMenu mySeat={mySeat} onUpdateSeat={updateSeat} onLeaveSeat={leaveSeat} />

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
          inspectedCharacterId={inspectedCharacterId}
          activeCharacterId={mySeat.activeCharacterId ?? null}
          onInspectCharacter={setInspectedCharacterId}
          onSetActiveCharacter={handleSetActiveCharacter}
          onRemoveFromScene={handleRemoveFromScene}
          onUpdateEntity={handleUpdateEntity}
          isTactical={isTactical}
          tacticalInfo={tacticalInfo}
        />

        {/* Top-right: Team dashboard */}
        <TeamDashboard roomId={roomId} isGM={isGM} />

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
          roomId={roomId}
          senderId={mySeatId}
          senderName={mySeat.name}
          senderColor={mySeat.color}
          portraitUrl={mySeat.portraitUrl || activeEntity?.imageUrl}
          seatProperties={seatProperties}
          speakerEntities={speakerEntities}
        />

        {/* Bottom center: GM Dock (unified toolbar) */}
        {isGM && (
          <GmDock
            activeSceneId={room.activeSceneId}
            isTactical={isTactical}
            onUpdateScene={updateScene}
            onToggleCombat={() => {
              if (isTactical) {
                exitTactical()
              } else {
                enterTactical()
              }
            }}
            onShowcaseImage={(imageUrl) => {
              addShowcaseItem({
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
              if (room.activeSceneId) addEntityToScene(room.activeSceneId, entityId)
            }}
            selectedToken={selectedToken}
            onAddToken={addToken}
            onDeleteToken={deleteToken}
            onSelectToken={setSelectedTokenId}
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
            onSelectScene={setActiveScene}
            onUpdateScene={updateScene}
            onDeleteScene={handleDeleteScene}
            onDuplicateScene={(sceneId) => {
              duplicateScene(sceneId, crypto.randomUUID())
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
        {bgContextMenu && (
          <ContextMenu
            x={bgContextMenu.x}
            y={bgContextMenu.y}
            items={[{ label: 'Add NPC', onClick: handleAddNpc }]}
            onClose={() => setBgContextMenu(null)}
          />
        )}

        {editingHandout && (
          <HandoutEditModal
            asset={editingHandout}
            onSave={updateHandoutAsset}
            onClose={() => setEditingHandout(null)}
          />
        )}
      </div>
    </ToastProvider>
  )
}

function useHashRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return hash
}

export default function App() {
  const hash = useHashRoute()

  if (hash === '#admin') {
    return <AdminPanel />
  }

  const roomMatch = hash.match(/^#room=([a-zA-Z0-9_-]+)$/)
  if (roomMatch) {
    return <RoomSession roomId={roomMatch[1]} />
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
        <h1 style={{ fontSize: 28, marginBottom: 16, fontWeight: 300 }}>myVTT</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
          Please obtain a room link from the administrator.
        </p>
        <a
          href="#admin"
          style={{ color: '#60a5fa', fontSize: 13, marginTop: 24, display: 'inline-block' }}
        >
          Admin Panel
        </a>
      </div>
    </div>
  )
}
