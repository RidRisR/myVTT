import { useEffect } from 'react'
import { Tldraw, type TLShape } from 'tldraw'
import 'tldraw/tldraw.css'
import { useYjsStore } from './useYjsStore'
import { PropertyContextMenu } from './PropertyContextMenu'
import { PropertyOverlay } from './PropertyOverlay'
import { IdentityBadge } from './RoleSwitcher'
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
  const { seats, mySeat, onlineSeatIds, claimSeat, createSeat, leaveSeat } = useIdentity(yDoc, awareness)

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
        components={{
          ContextMenu: PropertyContextMenu,
          InFrontOfTheCanvas: PropertyOverlay,
        }}
      />
      <IdentityBadge seat={mySeat} onLeave={leaveSeat} />
      <DiceSidebar yDoc={yDoc} playerName={mySeat.name} />
    </div>
  )
}
