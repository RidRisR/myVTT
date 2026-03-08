import { useEffect, useState } from 'react'
import { useYjsConnection } from './yjs/useYjsConnection'
import { useRoom } from './yjs/useRoom'
import { useScenes } from './yjs/useScenes'
import { useCombatTokens } from './combat/useCombatTokens'
import { SeatSelect } from './identity/SeatSelect'
import { useIdentity } from './identity/useIdentity'
import { useCharacters } from './characters/useCharacters'
import { roleStore } from './shared/roleState'
import { ChatPanel } from './chat/ChatPanel'
import { SceneViewer } from './scene/SceneViewer'
import { CombatViewer } from './combat/CombatViewer'
import { useTokenLibrary } from './combat/useTokenLibrary'
import { BottomDock } from './dock/BottomDock'
import { useHandoutAssets } from './dock/useHandoutAssets'
import type { HandoutAsset } from './dock/useHandoutAssets'

import { GmToolbar } from './gm/GmToolbar'
import { HamburgerMenu } from './layout/HamburgerMenu'
import { PortraitBar } from './layout/PortraitBar'
import { MyCharacterCard } from './layout/MyCharacterCard'
import { CharacterDetailPanel } from './layout/CharacterDetailPanel'
import { CharacterEditPanel } from './layout/CharacterEditPanel'
import { ContextMenu } from './shared/ContextMenu'
import { ShowcaseOverlay } from './showcase/ShowcaseOverlay'
import { useShowcase } from './showcase/useShowcase'
import type { ShowcaseItem } from './showcase/showcaseTypes'
import type { Character } from './shared/characterTypes'
import { HandoutEditModal } from './dock/HandoutEditModal'
import { generateTokenId } from './combat/combatUtils'

export default function App() {
  const { yDoc, isLoading, awareness } = useYjsConnection()
  const { seats, mySeat, mySeatId, onlineSeatIds, claimSeat, createSeat, deleteSeat, leaveSeat, updateSeat } = useIdentity(yDoc, awareness)
  const { room, setActiveScene, setCombatScene, enterCombat, exitCombat } = useRoom(yDoc)
  const { scenes, addScene, updateScene, deleteScene, getScene } = useScenes(yDoc)
  const { tokens, addToken, updateToken, deleteToken, getToken } = useCombatTokens(yDoc)
  const { blueprints, addBlueprint, updateBlueprint, deleteBlueprint } = useTokenLibrary(yDoc)
  const { characters, addCharacter, updateCharacter, deleteCharacter, getCharacter } = useCharacters(yDoc)
  const { addItem: addShowcaseItem } = useShowcase(yDoc)
  const { assets: handoutAssets, addAsset: addHandoutAsset, updateAsset: updateHandoutAsset, deleteAsset: deleteHandoutAsset } = useHandoutAssets(yDoc)

  const [inspectedCharacterId, setInspectedCharacterId] = useState<string | null>(null)
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [bgContextMenu, setBgContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [editingHandout, setEditingHandout] = useState<HandoutAsset | null>(null)
  // Sync role from seat
  useEffect(() => {
    if (mySeat) roleStore.set(mySeat.role)
  }, [mySeat?.role])

  // Auto-create Character for Seat on first login (migration / new seat)
  useEffect(() => {
    if (!mySeat || !mySeatId) return
    // Check if this seat already has a linked character
    const hasChar = characters.some(c => c.type === 'pc' && c.seatId === mySeatId)
    if (!hasChar) {
      const char: Character = {
        id: generateTokenId(),
        name: mySeat.name,
        imageUrl: '',
        color: mySeat.color,
        type: 'pc',
        seatId: mySeatId,
        size: 1,
        resources: [],
        attributes: [],
        statuses: [],
        notes: '',
        featured: true,
      }
      addCharacter(char)
      updateSeat(mySeatId, { activeCharacterId: char.id })
    } else if (!mySeat.activeCharacterId) {
      // Seat exists but no activeCharacterId set — set it
      const firstChar = characters.find(c => c.type === 'pc' && c.seatId === mySeatId)
      if (firstChar) {
        updateSeat(mySeatId, { activeCharacterId: firstChar.id })
      }
    }
  }, [mySeat, mySeatId, characters])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'sans-serif',
        fontSize: 18,
        color: '#666',
        background: '#1a1a2e',
      }}>
        Connecting to server...
      </div>
    )
  }

  if (!mySeat) {
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
  const isCombat = room.mode === 'combat'
  const activeScene = getScene(room.activeSceneId)
  const combatScene = getScene(room.combatSceneId)

  // Derive character data
  const activeCharacter = getCharacter(mySeat.activeCharacterId ?? null)
  const inspectedCharacter = inspectedCharacterId ? getCharacter(inspectedCharacterId) : null

  // For selected token in combat
  const selectedToken = isCombat ? getToken(selectedTokenId) : null
  const selectedTokenCharacter = selectedToken ? getCharacter(selectedToken.characterId) : null

  // Flatten resources + attributes into { key, value }[] for chat @key autocomplete
  const allProps = [
    ...(activeCharacter?.resources ?? []).filter(r => r.key).map(r => ({ key: r.key, value: String(r.current) })),
    ...(activeCharacter?.attributes ?? []).filter(a => a.key).map(a => ({ key: a.key, value: String(a.value) })),
    ...(selectedTokenCharacter?.resources ?? []).filter(r => r.key).map(r => ({ key: r.key, value: String(r.current) })),
    ...(selectedTokenCharacter?.attributes ?? []).filter(a => a.key).map(a => ({ key: a.key, value: String(a.value) })),
  ]
  // Deduplicate by key — later entries (token character) override earlier (active character)
  const seatProperties = [...new Map(allProps.map(p => [p.key, p])).values()]

  // Handle deleting a character (also delete linked combat tokens)
  const handleDeleteCharacter = (charId: string) => {
    // Delete any combat tokens linked to this character
    tokens.forEach(t => {
      if (t.characterId === charId) deleteToken(t.id)
    })
    deleteCharacter(charId)
    if (inspectedCharacterId === charId) setInspectedCharacterId(null)
  }

  // Handle setting active character
  const handleSetActiveCharacter = (charId: string) => {
    if (mySeatId) {
      updateSeat(mySeatId, { activeCharacterId: charId })
    }
  }

  const handleShowcaseHandout = (asset: HandoutAsset) => {
    const item: ShowcaseItem = {
      id: generateTokenId(),
      type: 'image',
      title: asset.title,
      description: asset.description,
      imageUrl: asset.imageUrl,
      senderId: mySeatId!,
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
    const newChar: Character = {
      id: generateTokenId(),
      name: 'New Character',
      imageUrl: '',
      color: '#3b82f6',
      type: 'npc',
      size: 1,
      resources: [],
      attributes: [],
      statuses: [],
      notes: '',
      featured: true,
    }
    addCharacter(newChar)
    setInspectedCharacterId(newChar.id)
    setBgContextMenu(null)
  }

  return (
    <div>
      {isCombat ? (
        <CombatViewer
          scene={combatScene}
          tokens={tokens}
          getCharacter={getCharacter}
          mySeatId={mySeatId!}
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
        characters={characters}
        mySeatId={mySeatId}
        isGM={isGM}
        onlineSeatIds={onlineSeatIds}
        inspectedCharacterId={inspectedCharacterId}
        activeCharacterId={mySeat.activeCharacterId ?? null}
        onInspectCharacter={(id) => setInspectedCharacterId(prev => prev === id ? null : id)}
        onSetActiveCharacter={handleSetActiveCharacter}
        onDeleteCharacter={handleDeleteCharacter}
        onUpdateCharacter={updateCharacter}
      />

      {/* Left: My character card (self-managed open/close via tab) */}
      {activeCharacter && (
        <MyCharacterCard
          character={activeCharacter}
          onUpdateCharacter={updateCharacter}
        />
      )}

      {/* Top-right: Inspected character detail */}
      {inspectedCharacter && (
        (inspectedCharacter.seatId === mySeatId) || (isGM && inspectedCharacter.type === 'npc') ? (
          <CharacterEditPanel
            character={inspectedCharacter}
            onUpdateCharacter={updateCharacter}
            onClose={() => setInspectedCharacterId(null)}
          />
        ) : (
          <CharacterDetailPanel
            character={inspectedCharacter}
            isOnline={inspectedCharacter.seatId ? (inspectedCharacter.seatId === mySeatId || onlineSeatIds.has(inspectedCharacter.seatId)) : false}
            onClose={() => setInspectedCharacterId(null)}
          />
        )
      )}

      {/* Center: Showcase spotlight overlay */}
      <ShowcaseOverlay
        yDoc={yDoc}
        mySeatId={mySeatId!}
        isGM={isGM}
      />

      {/* Bottom-right: Chat overlay */}
      <ChatPanel
        yDoc={yDoc}
        senderId={mySeatId!}
        senderName={mySeat.name}
        senderColor={mySeat.color}
        portraitUrl={mySeat.portraitUrl || activeCharacter?.imageUrl}
        seatProperties={seatProperties}
        favorites={activeCharacter?.favorites ?? []}
        onAddFavorite={(fav) => {
          if (!activeCharacter) return
          const existing = activeCharacter.favorites ?? []
          if (existing.some(f => f.formula === fav.formula)) return
          updateCharacter(activeCharacter.id, { favorites: [...existing, fav] })
        }}
        onRemoveFavorite={(formula) => {
          if (!activeCharacter) return
          const existing = activeCharacter.favorites ?? []
          updateCharacter(activeCharacter.id, { favorites: existing.filter(f => f.formula !== formula) })
        }}
        speakerCharacters={
          isGM
            ? characters.filter(c => c.type === 'npc' || c.seatId === mySeatId)
            : characters.filter(c => c.seatId === mySeatId)
        }
      />

      {/* Bottom dock: asset library (maps + tokens) — visible in both modes for GM */}
      {isGM && (
        <BottomDock
          scenes={scenes}
          combatSceneId={room.combatSceneId}
          onSetCombatScene={setCombatScene}
          onAddScene={addScene}
          onDeleteScene={deleteScene}
          blueprints={blueprints}
          onAddBlueprint={addBlueprint}
          onUpdateBlueprint={updateBlueprint}
          onDeleteBlueprint={deleteBlueprint}
          characters={characters}
          onAddCharacter={addCharacter}
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
          room={room}
          onSelectScene={setActiveScene}
          onEnterCombat={enterCombat}
          onExitCombat={exitCombat}
          onAddScene={addScene}
          onUpdateScene={updateScene}
          onDeleteScene={deleteScene}
        />
      )}

      {/* Background right-click context menu (GM only) */}
      {bgContextMenu && (
        <ContextMenu
          x={bgContextMenu.x}
          y={bgContextMenu.y}
          items={[
            { label: 'Add NPC', onClick: handleAddNpc },
          ]}
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
