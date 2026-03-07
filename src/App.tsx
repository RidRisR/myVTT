import { useEffect, useState } from 'react'
import { Tldraw, type Editor, type TLShape } from 'tldraw'
import 'tldraw/tldraw.css'
import { useYjsStore } from './useYjsStore'
import { PropertyContextMenu } from './PropertyContextMenu'
import { TokenPanel } from './panel/TokenPanel'
import { TokenOverlay } from './panel/TokenOverlay'
import { PlayerPanel } from './panel/PlayerPanel'
import { DiceSidebar } from './DiceSidebar'
import { SeatSelect } from './identity/SeatSelect'
import { useIdentity } from './identity/useIdentity'
import { currentRole } from './roleState'

function getShapeVisibility(shape: TLShape) {
  if (shape.meta?.gmOnly && currentRole.get() === 'PL') return 'hidden' as const
  return 'inherit' as const
}

export default function App() {
  const { store, yDoc, isLoading, awareness } = useYjsStore()
  const { seats, mySeat, mySeatId, onlineSeatIds, claimSeat, createSeat, leaveSeat, updateSeatProperties, updateSeatFavorites } = useIdentity(yDoc, awareness)
  const [editor, setEditor] = useState<Editor | null>(null)

  // Sync role atom from seat
  useEffect(() => {
    if (mySeat) currentRole.set(mySeat.role)
  }, [mySeat?.role])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#666',
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
      />
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        store={store}
        getShapeVisibility={getShapeVisibility}
        onMount={setEditor}
        components={{
          ContextMenu: PropertyContextMenu,
          InFrontOfTheCanvas: TokenOverlay,
        }}
      />
      <PlayerPanel
        seats={seats}
        mySeat={mySeat}
        mySeatId={mySeatId!}
        onlineSeatIds={onlineSeatIds}
        onLeave={leaveSeat}
        onUpdateProperties={updateSeatProperties}
      />
      <DiceSidebar
        yDoc={yDoc}
        playerName={mySeat.name}
        editor={editor}
        seatProperties={mySeat.properties ?? []}
        favorites={mySeat.favorites ?? []}
        onUpdateFavorites={(favs) => updateSeatFavorites(mySeatId!, favs)}
      />
      {editor && <TokenPanel editor={editor} />}
    </div>
  )
}
