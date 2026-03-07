import { useEffect } from 'react'
import { useYjsConnection } from './yjs/useYjsConnection'
import { useRoom } from './yjs/useRoom'
import { useScenes } from './yjs/useScenes'
import { SeatSelect } from './identity/SeatSelect'
import { useIdentity } from './identity/useIdentity'
import { roleStore } from './shared/roleState'
import { ChatPanel } from './chat/ChatPanel'
import { SceneViewer } from './scene/SceneViewer'
import { GmToolbar } from './gm/GmToolbar'

export default function App() {
  const { yDoc, isLoading, awareness } = useYjsConnection()
  const { seats, mySeat, mySeatId, onlineSeatIds, claimSeat, createSeat, deleteSeat } = useIdentity(yDoc, awareness)
  const { room, setActiveScene, enterCombat, exitCombat } = useRoom(yDoc)
  const { scenes, addScene, updateScene, deleteScene, getScene } = useScenes(yDoc)

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

  // Show seat selection if not seated
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

  return (
    <>
      {/* Viewport: Scene mode (combat mode will be added in Milestone 3) */}
      <SceneViewer scene={activeScene} />

      {/* Chat overlay */}
      <ChatPanel
        yDoc={yDoc}
        senderId={mySeatId!}
        senderName={mySeat.name}
        senderColor={mySeat.color}
        seatProperties={mySeat.properties ?? []}
      />

      {/* GM Toolbar */}
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
