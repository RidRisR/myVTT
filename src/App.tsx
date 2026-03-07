import { useEffect, useState } from 'react'
import { useYjsConnection } from './yjs/useYjsConnection'
import { useRoom } from './yjs/useRoom'
import { useScenes } from './yjs/useScenes'
import { SeatSelect } from './identity/SeatSelect'
import { useIdentity } from './identity/useIdentity'
import { roleStore } from './shared/roleState'
import { ChatPanel } from './chat/ChatPanel'
import { SceneViewer } from './scene/SceneViewer'
import { GmToolbar } from './gm/GmToolbar'
import { HamburgerMenu } from './layout/HamburgerMenu'
import { PortraitBar } from './layout/PortraitBar'
import { MyCharacterCard } from './layout/MyCharacterCard'
import { CharacterDetailPanel } from './layout/CharacterDetailPanel'

export default function App() {
  const { yDoc, isLoading, awareness } = useYjsConnection()
  const { seats, mySeat, mySeatId, onlineSeatIds, claimSeat, createSeat, deleteSeat, leaveSeat, updateSeat } = useIdentity(yDoc, awareness)
  const { room, setActiveScene, enterCombat, exitCombat } = useRoom(yDoc)
  const { scenes, addScene, updateScene, deleteScene, getScene } = useScenes(yDoc)

  const [inspectedSeatId, setInspectedSeatId] = useState<string | null>(null)

  // Sync role from seat
  useEffect(() => {
    if (mySeat) roleStore.set(mySeat.role)
  }, [mySeat?.role])

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
  const activeScene = getScene(room.activeSceneId)
  const inspectedSeat = inspectedSeatId ? seats.find(s => s.id === inspectedSeatId) : null

  // Flatten resources + attributes into { key, value }[] for chat @key autocomplete
  const seatProperties = [
    ...(mySeat.resources ?? []).filter(r => r.key).map(r => ({ key: r.key, value: String(r.current) })),
    ...(mySeat.attributes ?? []).filter(a => a.key).map(a => ({ key: a.key, value: String(a.value) })),
  ]

  return (
    <>
      <SceneViewer scene={activeScene} />

      {/* Top-left: Hamburger menu */}
      <HamburgerMenu mySeat={mySeat} onLeaveSeat={leaveSeat} />

      {/* Top-center: Portrait bar */}
      <PortraitBar
        seats={seats}
        mySeatId={mySeatId!}
        onlineSeatIds={onlineSeatIds}
        inspectedSeatId={inspectedSeatId}
        onInspectSeat={(id) => setInspectedSeatId(prev => prev === id ? null : id)}
      />

      {/* Left: My character card (self-managed open/close via tab) */}
      <MyCharacterCard
        seat={mySeat}
        seatId={mySeatId!}
        onUpdateSeat={updateSeat}
      />

      {/* Top-right: Inspected character detail */}
      {inspectedSeat && (
        <CharacterDetailPanel
          seat={inspectedSeat}
          isOnline={onlineSeatIds.has(inspectedSeatId!)}
          onClose={() => setInspectedSeatId(null)}
        />
      )}

      {/* Bottom-right: Chat overlay */}
      <ChatPanel
        yDoc={yDoc}
        senderId={mySeatId!}
        senderName={mySeat.name}
        senderColor={mySeat.color}
        seatProperties={seatProperties}
      />

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
    </>
  )
}
