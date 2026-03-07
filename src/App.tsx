import { useEffect, useState } from 'react'
import { Tldraw, DefaultToolbar, DefaultToolbarContent, ToolbarItem, type Editor, type TLShape, type TLImageShape, type JsonValue, type TLUiOverrides } from 'tldraw'
import 'tldraw/tldraw.css'
import { useYjsStore } from './useYjsStore'
import { PropertyContextMenu } from './PropertyContextMenu'
import { TokenPanel } from './panel/TokenPanel'
import { TokenOverlay } from './panel/TokenOverlay'
import { MeasureOverlay } from './tools/MeasureOverlay'
import { MeasureTool } from './tools/MeasureTool'
import { PlayerPanel } from './panel/PlayerPanel'
import { DiceSidebar } from './DiceSidebar'
import { SeatSelect } from './identity/SeatSelect'
import { useIdentity } from './identity/useIdentity'
import { CursorOverlay } from './tools/CursorOverlay'
import { useCursorSync } from './hooks/useCursorSync'
import { currentRole } from './roleState'

function getShapeVisibility(shape: TLShape) {
  if (shape.meta?.gmOnly && currentRole.get() === 'PL') return 'hidden' as const
  return 'inherit' as const
}

const measureTools = [MeasureTool]

const rulerIcon = (
  <svg viewBox="0 0 30 30" style={{ width: 16, height: 16 }}>
    <line x1="4" y1="26" x2="26" y2="4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="8" y1="22" x2="10.5" y2="19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="12" y1="18" x2="14.5" y2="15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="16" y1="14" x2="18.5" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="20" y1="10" x2="22.5" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const measureOverrides: TLUiOverrides = {
  tools(editor, tools) {
    return {
      ...tools,
      measure: {
        id: 'measure',
        label: 'Measure',
        icon: rulerIcon,
        kbd: 'm',
        onSelect(_source) {
          editor.setCurrentTool('measure')
        },
      },
    }
  },
}

function CustomToolbar() {
  return (
    <DefaultToolbar>
      <DefaultToolbarContent />
      <ToolbarItem tool="measure" />
    </DefaultToolbar>
  )
}

export default function App() {
  const { store, yDoc, isLoading, awareness } = useYjsStore()
  const { seats, mySeat, mySeatId, onlineSeatIds, claimSeat, createSeat, deleteSeat, leaveSeat, updateSeatProperties, updateSeatFavorites } = useIdentity(yDoc, awareness)
  const [editor, setEditor] = useState<Editor | null>(null)

  // Broadcast cursor position via awareness
  useCursorSync(editor, awareness)

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
        onDelete={deleteSeat}
      />
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <style>{`.tlui-layout__top { padding-right: 280px; }`}</style>
      <Tldraw
        store={store}
        tools={measureTools}
        overrides={measureOverrides}
        getShapeVisibility={getShapeVisibility}
        onMount={setEditor}
        components={{
          ContextMenu: PropertyContextMenu,
          InFrontOfTheCanvas: TokenOverlay,
          Toolbar: CustomToolbar,
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
      {editor && <MeasureOverlay editor={editor} />}
      {editor && awareness && <CursorOverlay editor={editor} awareness={awareness} />}
    </div>
  )
}
