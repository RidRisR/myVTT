import { useEffect, useState } from 'react'
import { Tldraw, type Editor, type TLShape, type TLImageShape, type JsonValue } from 'tldraw'
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

  // Auto-init meta on new shapes (local only)
  useEffect(() => {
    if (!editor) return
    return editor.store.listen(
      ({ changes }) => {
        const toUpdate: { id: TLShape['id']; type: string; meta: Record<string, unknown> }[] = []
        for (const record of Object.values(changes.added)) {
          if (!('type' in record) || record.typeName !== 'shape') continue
          const shape = record as TLShape
          if (typeof shape.meta?.name === 'string') continue
          let name = ''
          if (shape.type === 'image') {
            const imgShape = shape as TLImageShape
            if (imgShape.props.assetId) {
              const asset = editor.getAsset(imgShape.props.assetId)
              if (asset?.props && 'name' in asset.props) {
                name = (asset.props.name as string).replace(/\.[^.]+$/, '')
              }
            }
          }
          toUpdate.push({ id: shape.id, type: shape.type, meta: { ...shape.meta, name, properties: [], nameDisplay: 'hidden' } as Record<string, JsonValue> })
        }
        if (toUpdate.length > 0) {
          for (const upd of toUpdate) editor.updateShape(upd)
        }
      },
      { source: 'user', scope: 'document' },
    )
  }, [editor])

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
      <style>{`.tlui-layout__top { padding-right: 280px; }`}</style>
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
