import { useEffect, useState, useCallback } from 'react'
import { useDualDocConnection } from './yjs/useDualDocConnection'
import { AdminPanel } from './admin/AdminPanel'
import { useRoom } from './yjs/useRoom'
import { useScenes } from './yjs/useScenes'
import type { Scene } from './yjs/useScenes'
import { useWorld } from './yjs/useWorld'
import { useEntities } from './entities/useEntities'
import { useSceneTokens } from './combat/useSceneTokens'
import { SeatSelect } from './identity/SeatSelect'
import { useIdentity } from './identity/useIdentity'
import { roleStore } from './shared/roleState'
import { ChatPanel } from './chat/ChatPanel'
import { SceneViewer } from './scene/SceneViewer'
import { CombatViewer } from './combat/CombatViewer'
import { BottomDock } from './dock/BottomDock'
import { useHandoutAssets } from './dock/useHandoutAssets'
import type { HandoutAsset } from './dock/useHandoutAssets'

import { GmToolbar } from './gm/GmToolbar'
import { useGmMergedView } from './gm/useGmMergedView'
import { revealEntity, hideEntity } from './gm/secretApi'
import { HamburgerMenu } from './layout/HamburgerMenu'
import { PortraitBar } from './layout/PortraitBar'
import { MyCharacterCard } from './layout/MyCharacterCard'
import { ContextMenu } from './shared/ContextMenu'
import { ShowcaseOverlay } from './showcase/ShowcaseOverlay'
import { useShowcase } from './showcase/useShowcase'
import type { ShowcaseItem } from './showcase/showcaseTypes'
import type { Entity } from './shared/entityTypes'
import { defaultNPCPermissions } from './shared/permissions'
import { getEntityResources, getEntityAttributes } from './shared/entityAdapters'
import {
  gcOrphanedEntities,
  addEntityToAllScenes,
  getPersistentEntityIds,
} from './entities/entityLifecycle'
import { HandoutEditModal } from './dock/HandoutEditModal'
import { generateTokenId } from './shared/idUtils'
import { TeamDashboard } from './team/TeamDashboard'

function RoomSession({ roomId, token }: { roomId: string; token: string | null }) {
  const { publicDoc, secretDoc, isLoading, awareness } = useDualDocConnection(roomId, token)
  const world = useWorld(publicDoc)
  const {
    seats,
    mySeat,
    mySeatId,
    onlineSeatIds,
    claimSeat,
    createSeat,
    deleteSeat,
    leaveSeat,
    updateSeat,
  } = useIdentity(world.seats, awareness)
  const { room, setActiveScene } = useRoom(world.room)
  const {
    scenes,
    addScene,
    updateScene,
    deleteScene,
    getScene,
    addEntityToScene,
    removeEntityFromScene,
    getSceneEntityIds,
    setCombatActive,
  } = useScenes(world.scenes, publicDoc)

  const { entities, addEntity, updateEntity, getEntity } = useEntities(world, publicDoc)
  const mergedEntities = useGmMergedView(entities, secretDoc)

  const activeScene = getScene(room.activeSceneId)
  const isCombat = activeScene?.combatActive ?? false
  const combatSceneId = isCombat ? room.activeSceneId : null
  const { tokens, addToken, updateToken, deleteToken, getToken } = useSceneTokens(
    world,
    combatSceneId,
  )

  const { addItem: addShowcaseItem } = useShowcase(publicDoc)
  const {
    assets: handoutAssets,
    addAsset: addHandoutAsset,
    updateAsset: updateHandoutAsset,
    deleteAsset: deleteHandoutAsset,
  } = useHandoutAssets(publicDoc)

  const [inspectedCharacterId, setInspectedCharacterId] = useState<string | null>(null)
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [bgContextMenu, setBgContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [editingHandout, setEditingHandout] = useState<HandoutAsset | null>(null)

  const handleRevealEntity = useCallback(
    async (entityId: string) => {
      if (!token) return
      await revealEntity(roomId, token, entityId)
    },
    [roomId, token],
  )

  const handleHideEntity = useCallback(
    async (entityId: string) => {
      if (!token) return
      await hideEntity(roomId, token, entityId)
    },
    [roomId, token],
  )

  // Sync role from seat
  const mySeatRole = mySeat?.role
  useEffect(() => {
    if (mySeatRole) roleStore.set(mySeatRole)
  }, [mySeatRole])

  // Auto-set activeCharacterId if seat has an owned entity but no active one
  useEffect(() => {
    if (!mySeat || !mySeatId) return
    if (mySeat.activeCharacterId) return // already set
    const ownedEntity = entities.find((e) => e.permissions.seats[mySeatId] === 'owner')
    if (ownedEntity) {
      updateSeat(mySeatId, { activeCharacterId: ownedEntity.id })
    }
  }, [mySeat, mySeatId, entities, updateSeat])

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

  // Derive entity data
  const activeEntity = getEntity(mySeat.activeCharacterId ?? null)
  // For selected token in combat
  const selectedToken = isCombat ? getToken(selectedTokenId) : null
  const selectedTokenEntity = selectedToken?.entityId ? getEntity(selectedToken.entityId) : null

  // Flatten resources + attributes into { key, value }[] for chat @key autocomplete
  const allProps = [
    ...getEntityResources(activeEntity)
      .filter((r) => r.key)
      .map((r) => ({ key: r.key, value: String(r.current) })),
    ...getEntityAttributes(activeEntity)
      .filter((a) => a.key)
      .map((a) => ({ key: a.key, value: String(a.value) })),
    ...getEntityResources(selectedTokenEntity)
      .filter((r) => r.key)
      .map((r) => ({ key: r.key, value: String(r.current) })),
    ...getEntityAttributes(selectedTokenEntity)
      .filter((a) => a.key)
      .map((a) => ({ key: a.key, value: String(a.value) })),
  ]
  // Deduplicate by key — later entries (token entity) override earlier (active entity)
  const seatProperties = [...new Map(allProps.map((p) => [p.key, p])).values()]

  // Derive current scene's entity IDs for PortraitBar filtering
  const sceneEntityIds = room.activeSceneId ? getSceneEntityIds(room.activeSceneId) : []

  // Handle removing an entity from the current scene (without deleting it)
  const handleRemoveFromScene = (entityId: string) => {
    if (room.activeSceneId) removeEntityFromScene(room.activeSceneId, entityId)
    if (inspectedCharacterId === entityId) setInspectedCharacterId(null)
  }

  // Delete scene + garbage-collect orphaned non-persistent entities
  const handleDeleteScene = (sceneId: string) => {
    const entityIds = getSceneEntityIds(sceneId)
    deleteScene(sceneId)
    publicDoc.transact(() => {
      const deleted = gcOrphanedEntities(entityIds, world.scenes, world.entities)
      if (deleted.length > 0 && inspectedCharacterId && deleted.includes(inspectedCharacterId)) {
        setInspectedCharacterId(null)
      }
    })
  }

  // Add scene with persistent entities auto-joined
  const handleAddScene = (scene: Scene) => {
    const persistentIds = getPersistentEntityIds(world.entities)
    addScene(scene, persistentIds)
  }

  // Add entity — if persistent, auto-join all existing scenes
  const handleAddEntity = (entity: Entity) => {
    addEntity(entity)
    if (entity.persistent) {
      addEntityToAllScenes(entity.id, world.scenes)
    }
  }

  // Update entity — if persistent toggled to true, auto-join all scenes
  const handleUpdateEntity = (id: string, updates: Partial<Entity>) => {
    if (updates.persistent === true) {
      const existing = getEntity(id)
      if (existing && !existing.persistent) {
        addEntityToAllScenes(id, world.scenes)
      }
    }
    updateEntity(id, updates)
  }

  // Handle setting active character
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

  return (
    <div>
      {isCombat ? (
        <CombatViewer
          scene={activeScene}
          tokens={tokens}
          getEntity={getEntity}
          mySeatId={mySeatId}
          role={mySeat.role}
          selectedTokenId={selectedTokenId}
          onSelectToken={setSelectedTokenId}
          onUpdateToken={updateToken}
          onContextMenu={handleBgContextMenu}
        />
      ) : (
        <SceneViewer scene={activeScene} onContextMenu={handleBgContextMenu} />
      )}

      {/* Top-left: Hamburger menu */}
      <HamburgerMenu mySeat={mySeat} onUpdateSeat={updateSeat} onLeaveSeat={leaveSeat} />

      {/* Top-center: Portrait bar */}
      <PortraitBar
        entities={mergedEntities}
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
        onRevealEntity={handleRevealEntity}
        onHideEntity={handleHideEntity}
      />

      {/* Top-right: Team dashboard */}
      <TeamDashboard yDoc={publicDoc} isGM={isGM} />

      {/* Left: My character card (self-managed open/close via tab) */}
      {activeEntity && (
        <MyCharacterCard entity={activeEntity} onUpdateEntity={handleUpdateEntity} />
      )}

      {/* Center: Showcase spotlight overlay */}
      <ShowcaseOverlay yDoc={publicDoc} isGM={isGM} />

      {/* Bottom-right: Chat overlay */}
      <ChatPanel
        yDoc={publicDoc}
        senderId={mySeatId}
        senderName={mySeat.name}
        senderColor={mySeat.color}
        portraitUrl={mySeat.portraitUrl || activeEntity?.imageUrl}
        seatProperties={seatProperties}
        speakerEntities={
          isGM ? mergedEntities : entities.filter((e) => e.permissions.seats[mySeatId] === 'owner')
        }
      />

      {/* Bottom dock: asset library (maps + tokens) — visible in both modes for GM */}
      {isGM && (
        <BottomDock
          scenes={scenes}
          activeSceneId={room.activeSceneId}
          onSelectScene={setActiveScene}
          onAddScene={handleAddScene}
          onDeleteScene={handleDeleteScene}
          blueprints={world.blueprints}
          entities={entities}
          onAddEntity={handleAddEntity}
          onAddEntityToScene={(entityId) => {
            if (room.activeSceneId) addEntityToScene(room.activeSceneId, entityId)
          }}
          isCombat={isCombat}
          selectedToken={getToken(selectedTokenId)}
          onAddToken={addToken}
          onDeleteToken={deleteToken}
          onUpdateToken={updateToken}
          onSelectToken={setSelectedTokenId}
          handoutAssets={handoutAssets}
          onAddHandoutAsset={addHandoutAsset}
          onEditHandoutAsset={setEditingHandout}
          onDeleteHandoutAsset={deleteHandoutAsset}
          onShowcaseHandout={handleShowcaseHandout}
        />
      )}

      {/* Bottom-left: GM Toolbar */}
      {isGM && (
        <GmToolbar
          scenes={scenes}
          activeSceneId={room.activeSceneId}
          isCombat={isCombat}
          onSelectScene={setActiveScene}
          onToggleCombat={() => {
            if (room.activeSceneId) setCombatActive(room.activeSceneId, !isCombat)
          }}
          onAddScene={handleAddScene}
          onUpdateScene={updateScene}
          onDeleteScene={handleDeleteScene}
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

  const roomMatch = hash.match(/^#room=([a-zA-Z0-9_-]+)(?:&token=([a-zA-Z0-9_-]+))?$/)
  if (roomMatch) {
    return (
      <RoomSession
        key={`${roomMatch[1]}-${roomMatch[2] ?? ''}`}
        roomId={roomMatch[1]}
        token={roomMatch[2] ?? null}
      />
    )
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
