import { useEffect, useState } from 'react'
import { useYjsConnection } from './yjs/useYjsConnection'
import { AdminPanel } from './admin/AdminPanel'
import { useWorldStore } from './stores/worldStore'
import type { Scene, HandoutAsset } from './stores/worldStore'
import { useIdentityStore } from './stores/identityStore'
import { useUiStore } from './stores/uiStore'
import {
  selectActiveScene,
  selectIsCombat,
  deriveSeatProperties,
  selectSpeakerEntities,
} from './stores/selectors'
import { useWorld } from './yjs/useWorld'
import { roleStore } from './shared/roleState'
import { SeatSelect } from './identity/SeatSelect'
import { ChatPanel } from './chat/ChatPanel'
import { SceneViewer } from './scene/SceneViewer'
import { AmbientAudio } from './scene/AmbientAudio'
import { TacticalPanel } from './combat/TacticalPanel'
import { GmDock } from './gm/GmDock'

import { SceneButton } from './gm/SceneButton'
import { HamburgerMenu } from './layout/HamburgerMenu'
import { PortraitBar } from './layout/PortraitBar'
import { MyCharacterCard } from './layout/MyCharacterCard'
import { ContextMenu } from './shared/ContextMenu'
import { ShowcaseOverlay } from './showcase/ShowcaseOverlay'
import type { ShowcaseItem } from './showcase/showcaseTypes'
import type { Entity, MapToken } from './shared/entityTypes'
import { defaultNPCPermissions } from './shared/permissions'
import {
  gcOrphanedEntities,
  addEntityToAllScenes,
  getPersistentEntityIds,
} from './entities/entityLifecycle'
import { HandoutEditModal } from './dock/HandoutEditModal'
import { generateTokenId } from './shared/idUtils'
import { TeamDashboard } from './team/TeamDashboard'
import { ToastProvider } from './shared/ui/ToastProvider'

function RoomSession({ roomId }: { roomId: string }) {
  const { yDoc, isLoading, awareness } = useYjsConnection(roomId)
  const world = useWorld(yDoc)

  // Initialize stores with Yjs data
  const initWorld = useWorldStore((s) => s.init)
  const initIdentity = useIdentityStore((s) => s.init)

  useEffect(() => {
    const cleanupWorld = initWorld(yDoc)
    const cleanupIdentity = initIdentity(world.seats, awareness)
    return () => {
      cleanupWorld()
      cleanupIdentity()
    }
  }, [yDoc, awareness, world.seats, initWorld, initIdentity])

  // World store subscriptions
  const room = useWorldStore((s) => s.room)
  const scenes = useWorldStore((s) => s.scenes)
  const entities = useWorldStore((s) => s.entities)
  const tokens = useWorldStore((s) => s.tokens)
  const handoutAssets = useWorldStore((s) => s.handoutAssets)
  const activeScene = useWorldStore(selectActiveScene)
  const isCombat = useWorldStore(selectIsCombat)

  // World store actions
  const setActiveScene = useWorldStore((s) => s.setActiveScene)
  const addScene = useWorldStore((s) => s.addScene)
  const updateScene = useWorldStore((s) => s.updateScene)
  const deleteSceneRaw = useWorldStore((s) => s.deleteScene)
  const addEntityToScene = useWorldStore((s) => s.addEntityToScene)
  const removeEntityFromScene = useWorldStore((s) => s.removeEntityFromScene)
  const getSceneEntityIds = useWorldStore((s) => s.getSceneEntityIds)
  const setCombatActive = useWorldStore((s) => s.setCombatActive)
  const duplicateScene = useWorldStore((s) => s.duplicateScene)
  const setInitiativeOrder = useWorldStore((s) => s.setInitiativeOrder)
  const advanceInitiative = useWorldStore((s) => s.advanceInitiative)
  const addEntity = useWorldStore((s) => s.addEntity)
  const updateEntity = useWorldStore((s) => s.updateEntity)
  const addToken = useWorldStore((s) => s.addToken)
  const updateToken = useWorldStore((s) => s.updateToken)
  const deleteToken = useWorldStore((s) => s.deleteToken)
  const addShowcaseItem = useWorldStore((s) => s.addShowcaseItem)
  const addHandoutAsset = useWorldStore((s) => s.addHandoutAsset)
  const updateHandoutAsset = useWorldStore((s) => s.updateHandoutAsset)
  const deleteHandoutAsset = useWorldStore((s) => s.deleteHandoutAsset)
  const setActiveTokenScene = useWorldStore((s) => s.setActiveTokenScene)

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

  // Manage token observer based on combat scene
  const combatSceneId = isCombat ? room.activeSceneId : null
  useEffect(() => {
    setActiveTokenScene(combatSceneId)
  }, [combatSceneId, setActiveTokenScene])

  // Auto-set activeCharacterId if seat has an owned entity but no active one
  useEffect(() => {
    if (!mySeat || !mySeatId) return
    if (mySeat.activeCharacterId) return
    const ownedEntity = entities.find((e) => e.permissions.seats[mySeatId] === 'owner')
    if (ownedEntity) {
      updateSeat(mySeatId, { activeCharacterId: ownedEntity.id })
    }
  }, [mySeat, mySeatId, entities, updateSeat])

  // Derive entity data (hooks must be before early returns)
  const getEntity = (id: string | null): Entity | null => {
    if (!id) return null
    return entities.find((e) => e.id === id) ?? null
  }

  const activeEntity = getEntity(mySeat?.activeCharacterId ?? null)
  const selectedToken = isCombat ? (tokens.find((t) => t.id === selectedTokenId) ?? null) : null
  const selectedTokenEntity = selectedToken?.entityId ? getEntity(selectedToken.entityId) : null

  const seatProperties = deriveSeatProperties(activeEntity, selectedTokenEntity)

  const sceneEntityIds = room.activeSceneId ? getSceneEntityIds(room.activeSceneId) : []

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'sans-serif',
          fontSize: 18,
          color: '#666',
          background: '#1a1a2e',
        }}
      >
        Connecting to server...
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
    const entityIds = getSceneEntityIds(sceneId)
    deleteSceneRaw(sceneId)
    yDoc.transact(() => {
      const deleted = gcOrphanedEntities(entityIds, world.scenes, world.entities)
      if (deleted.length > 0 && inspectedCharacterId && deleted.includes(inspectedCharacterId)) {
        setInspectedCharacterId(null)
      }
    })
  }

  const handleAddScene = (scene: Scene) => {
    const persistentIds = getPersistentEntityIds(world.entities)
    addScene(scene, persistentIds)
  }

  const handleAddEntity = (entity: Entity) => {
    addEntity(entity)
    if (entity.persistent) {
      addEntityToAllScenes(entity.id, world.scenes)
    }
  }

  const handleUpdateEntity = (id: string, updates: Partial<Entity>) => {
    if (updates.persistent === true) {
      const existing = getEntity(id)
      if (existing && !existing.persistent) {
        addEntityToAllScenes(id, world.scenes)
      }
    }
    updateEntity(id, updates)
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
    const newEntity: Entity = {
      id: generateTokenId(),
      name: 'New NPC',
      imageUrl: '',
      color: '#3b82f6',
      size: 1,
      notes: '',
      ruleData: null,
      permissions: defaultNPCPermissions(),
      persistent: false,
    }
    handleAddEntity(newEntity)
    if (room.activeSceneId) addEntityToScene(room.activeSceneId, newEntity.id)
    setInspectedCharacterId(newEntity.id)
    setBgContextMenu(null)
  }

  const handleDropEntityOnMap = (entityId: string, mapX: number, mapY: number) => {
    const entity = getEntity(entityId)
    if (!entity) return
    const newToken: MapToken = {
      id: generateTokenId(),
      entityId: entity.id,
      x: mapX,
      y: mapY,
      size: entity.size || 1,
      color: entity.color,
      imageUrl: entity.imageUrl,
      label: entity.name,
      permissions: { default: entity.permissions.default, seats: { ...entity.permissions.seats } },
    }
    addToken(newToken)
    setSelectedTokenId(newToken.id)
  }

  return (
    <ToastProvider>
      <div>
        <SceneViewer scene={activeScene} blurred={isCombat} onContextMenu={handleBgContextMenu} />
        <AmbientAudio
          audioUrl={activeScene?.ambientAudioUrl}
          volume={activeScene?.ambientAudioVolume ?? 0.5}
        />

        {activeScene && (
          <TacticalPanel
            scene={activeScene}
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
            visible={isCombat}
          />
        )}

        {/* Top-left: Hamburger menu */}
        <HamburgerMenu mySeat={mySeat} onUpdateSeat={updateSeat} onLeaveSeat={leaveSeat} />

        {/* Top-center: Portrait bar */}
        <PortraitBar
          entities={entities}
          sceneEntityIds={sceneEntityIds}
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
          isCombat={isCombat}
          activeScene={activeScene}
          onSetInitiativeOrder={(order) => {
            if (room.activeSceneId) setInitiativeOrder(room.activeSceneId, order)
          }}
          onAdvanceInitiative={() => {
            if (room.activeSceneId) advanceInitiative(room.activeSceneId)
          }}
        />

        {/* Top-right: Team dashboard */}
        <TeamDashboard yDoc={yDoc} isGM={isGM} />

        {/* Left: My character card (self-managed open/close via tab) */}
        {activeEntity && (
          <MyCharacterCard entity={activeEntity} onUpdateEntity={handleUpdateEntity} />
        )}

        {/* Center: Showcase spotlight overlay */}
        <ShowcaseOverlay yDoc={yDoc} isGM={isGM} />

        {/* Bottom-right: Chat overlay */}
        <ChatPanel
          yDoc={yDoc}
          senderId={mySeatId}
          senderName={mySeat.name}
          senderColor={mySeat.color}
          portraitUrl={mySeat.portraitUrl || activeEntity?.imageUrl}
          seatProperties={seatProperties}
          speakerEntities={selectSpeakerEntities(entities, mySeatId, isGM)}
        />

        {/* Bottom center: GM Dock (unified toolbar) */}
        {isGM && (
          <GmDock
            scenes={scenes}
            activeSceneId={room.activeSceneId}
            isCombat={isCombat}
            onAddScene={handleAddScene}
            onDeleteScene={handleDeleteScene}
            onUpdateScene={updateScene}
            onToggleCombat={() => {
              if (room.activeSceneId) setCombatActive(room.activeSceneId, !isCombat)
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
            blueprints={world.blueprints}
            entities={entities}
            onAddEntity={handleAddEntity}
            onAddEntityToScene={(entityId) => {
              if (room.activeSceneId) addEntityToScene(room.activeSceneId, entityId)
            }}
            selectedToken={selectedToken}
            onAddToken={addToken}
            onDeleteToken={deleteToken}
            onUpdateToken={updateToken}
            onSelectToken={setSelectedTokenId}
            handoutAssets={handoutAssets}
            onAddHandoutAsset={addHandoutAsset}
            onEditHandoutAsset={setEditingHandout}
            onDeleteHandoutAsset={deleteHandoutAsset}
            onShowcaseHandout={handleShowcaseHandout}
            onSetAsTacticalMap={(imageUrl: string) => {
              if (room.activeSceneId)
                updateScene(room.activeSceneId, { tacticalMapImageUrl: imageUrl })
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
              handleAddScene({
                id: crypto.randomUUID(),
                name: 'New Scene',
                atmosphereImageUrl: '',
                tacticalMapImageUrl: '',
                particlePreset: 'none',
                width: 0,
                height: 0,
                gridSize: 50,
                gridSnap: true,
                gridVisible: true,
                gridColor: 'rgba(255,255,255,0.15)',
                gridOffsetX: 0,
                gridOffsetY: 0,
                sortOrder: scenes.length,
                ambientPreset: 'none',
                ambientAudioUrl: '',
                ambientAudioVolume: 0.5,
                combatActive: false,
                battleMapUrl: '',
                initiativeOrder: [],
                initiativeIndex: 0,
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
