import { useEditor, useValue, type Editor, type TLShapeId } from 'tldraw'
import { useHoldRepeat } from './useHoldRepeat'
import {
  type Resource, type Attribute, type Status,
  readResources, readAttributes, readStatuses,
  statusColor,
} from './tokenUtils'

interface OverlayItem {
  id: TLShapeId
  name: string
  isActive: boolean
  isSelected: boolean
  resources: Resource[]
  attributes: Attribute[]
  statuses: Status[]
  bottomX: number
  bottomY: number
  rightX: number
  rightY: number
  width: number
  scale: number
}

export function TokenOverlay() {
  const editor = useEditor()

  const overlays = useValue('tokenOverlays', () => {
    const hoveredId = editor.getHoveredShapeId()
    const selectedIds = editor.getSelectedShapeIds()
    const sortedShapes = editor.getCurrentPageShapesSorted()
    const result: OverlayItem[] = []

    for (let si = 0; si < sortedShapes.length; si++) {
      const shape = sortedShapes[si]
      const name = (shape.meta?.name as string) ?? ''
      const nameDisplay = (shape.meta?.nameDisplay as string) ?? 'hidden'
      const resources = readResources(shape.meta?.resources)
      const attributes = readAttributes(shape.meta?.attributes)
      const statuses = readStatuses(shape.meta?.statuses)

      const isSelected = selectedIds.includes(shape.id)
      const isActive = shape.id === hoveredId || isSelected

      const showName = name && (
        nameDisplay === 'always' ||
        (nameDisplay === 'hover' && isActive)
      )

      // Show overlay if there's something to display
      const hasBottom = showName || statuses.length > 0 || resources.length > 0
      const hasRight = isActive && (resources.length > 0 || attributes.length > 0)

      if (!hasBottom && !hasRight) continue

      const bounds = editor.getShapePageBounds(shape.id)
      if (!bounds) continue

      // Occlusion check for non-active shapes
      if (!isActive) {
        let occluded = false
        for (let j = si + 1; j < sortedShapes.length; j++) {
          const aboveBounds = editor.getShapePageBounds(sortedShapes[j].id)
          if (!aboveBounds) continue
          if (
            aboveBounds.minX <= bounds.midX && aboveBounds.maxX >= bounds.midX &&
            aboveBounds.minY <= bounds.midY && aboveBounds.maxY >= bounds.midY
          ) {
            occluded = true
            break
          }
        }
        if (occluded) continue
      }

      const bottomCenter = editor.pageToScreen({ x: bounds.midX, y: bounds.maxY })
      const topRight = editor.pageToScreen({ x: bounds.maxX, y: bounds.minY })
      const screenWidth = bounds.width * editor.getZoomLevel()

      if (screenWidth < 50 && !isActive) continue

      const scale = Math.max(0.85, Math.min(1.8, Math.sqrt(screenWidth / 120)))

      result.push({
        id: shape.id,
        name: showName ? name : '',
        isActive,
        isSelected,
        resources,
        attributes,
        statuses,
        bottomX: bottomCenter.x,
        bottomY: bottomCenter.y,
        rightX: topRight.x + 8 * scale,
        rightY: topRight.y,
        width: Math.max(screenWidth, 60),
        scale,
      })
    }
    return result
  }, [editor])

  if (overlays.length === 0) return null

  return (
    <>
      {overlays.map((o) => (
        <div key={o.id}>
          {/* Bottom zone: name + status chips + resource bars */}
          {(o.name || o.statuses.length > 0 || o.resources.length > 0) && (
            <div
              style={{
                position: 'fixed',
                left: o.bottomX,
                top: o.bottomY,
                transform: `translate(-50%, -100%) scale(${o.scale})`,
                transformOrigin: 'bottom center',
                pointerEvents: 'none',
                zIndex: o.isActive ? 99999 : 99998,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                fontFamily: 'sans-serif',
              }}
            >
              {o.name && (
                <div style={{
                  fontSize: 11, fontWeight: 700, color: '#333',
                  background: 'rgba(255,255,255,0.85)', borderRadius: 4,
                  padding: '1px 6px', whiteSpace: 'nowrap',
                }}>
                  {o.name}
                </div>
              )}
              {/* Status chips */}
              {o.statuses.length > 0 && (
                <div style={{ display: 'flex', gap: 2, flexWrap: 'nowrap' }}>
                  {o.statuses.slice(0, 3).map((s, i) => (
                    <StatusChip
                      key={i}
                      status={s}
                      isSelected={o.isSelected}
                      editor={editor}
                      shapeId={o.id}
                    />
                  ))}
                  {o.statuses.length > 3 && (
                    <span style={{
                      fontSize: 8, color: '#999', padding: '1px 3px',
                      background: 'rgba(255,255,255,0.85)', borderRadius: 6,
                    }}>
                      +{o.statuses.length - 3}
                    </span>
                  )}
                </div>
              )}
              {/* Resource bars */}
              {o.resources.map((r) => (
                <ResourceBar
                  key={r.key}
                  resource={r}
                  barWidth={o.width / o.scale}
                />
              ))}
            </div>
          )}

          {/* Right side: resources + attributes on hover/select */}
          {o.isActive && (o.resources.length > 0 || o.attributes.length > 0) && (
            <div
              style={{
                position: 'fixed',
                left: o.rightX,
                top: o.rightY,
                transform: `scale(${o.scale})`,
                transformOrigin: 'top left',
                pointerEvents: 'none',
                zIndex: o.isActive ? 99999 : 99998,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                fontFamily: 'sans-serif',
              }}
            >
              {o.resources.map((r) => (
                <ResourceRightSide
                  key={r.key}
                  resource={r}
                  isSelected={o.isSelected}
                  editor={editor}
                  shapeId={o.id}
                />
              ))}
              {o.attributes.map((a) => (
                <div key={a.key} style={{
                  fontSize: 10, color: '#555',
                  background: 'rgba(255,255,255,0.9)', borderRadius: 3,
                  padding: '1px 5px', whiteSpace: 'nowrap',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                }}>
                  <span style={{ fontWeight: 600 }}>{a.key}</span>: {a.value}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

/* ── Status Chip (on canvas) ── */

function StatusChip({ status, isSelected, editor, shapeId }: {
  status: Status; isSelected: boolean; editor: Editor; shapeId: TLShapeId;
}) {
  const handleRemove = () => {
    const shape = editor.getShape(shapeId)
    if (!shape) return
    const updated = readStatuses(shape.meta?.statuses).filter(s => s.label !== status.label)
    editor.updateShape({
      id: shape.id, type: shape.type,
      meta: { ...shape.meta, statuses: updated } as any,
    })
  }

  return (
    <span
      onClick={isSelected ? handleRemove : undefined}
      style={{
        fontSize: 8, padding: '1px 5px', borderRadius: 8,
        background: statusColor(status.label), color: '#fff',
        whiteSpace: 'nowrap',
        pointerEvents: isSelected ? 'auto' : 'none',
        cursor: isSelected ? 'pointer' : 'default',
      }}
    >
      {status.label}
    </span>
  )
}

/* ── Resource Bar (bottom, read-only) ── */

function ResourceBar({ resource, barWidth }: {
  resource: Resource; barWidth: number;
}) {
  const pct = resource.max > 0 ? Math.min(resource.current / resource.max, 1) : 0
  return (
    <div style={{
      width: Math.max(barWidth * 0.8, 40), height: 4,
      background: 'rgba(0,0,0,0.15)', borderRadius: 2,
      overflow: 'hidden',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: `${pct * 100}%`, height: '100%',
        background: resource.color, borderRadius: 2,
        transition: 'width 0.2s',
      }} />
    </div>
  )
}

/* ── Resource Right Side (with +/- when selected) ── */

function ResourceRightSide({ resource, isSelected, editor, shapeId }: {
  resource: Resource; isSelected: boolean; editor: Editor; shapeId: TLShapeId;
}) {
  const updateCurrent = (delta: number) => {
    const shape = editor.getShape(shapeId)
    if (!shape) return
    const resources = readResources(shape.meta?.resources)
    const idx = resources.findIndex(r => r.key === resource.key)
    if (idx === -1) return
    const r = resources[idx]
    const updated = [...resources]
    updated[idx] = { ...r, current: Math.max(0, Math.min(r.current + delta, r.max)) }
    editor.updateShape({
      id: shape.id, type: shape.type,
      meta: { ...shape.meta, resources: updated } as any,
    })
  }

  const { holdStart: holdStartMinus, holdStop: holdStopMinus } = useHoldRepeat((count) => {
    updateCurrent(count >= 15 ? -5 : -1)
  })

  const { holdStart: holdStartPlus, holdStop: holdStopPlus } = useHoldRepeat((count) => {
    updateCurrent(count >= 15 ? 5 : 1)
  })

  const btnStyle: React.CSSProperties = {
    pointerEvents: 'auto',
    width: 16, height: 16,
    border: 'none', borderRadius: 3,
    background: 'rgba(0,0,0,0.08)',
    color: '#555', fontSize: 11, fontWeight: 700,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, lineHeight: 1, flexShrink: 0,
    userSelect: 'none',
  }

  return (
    <div style={{
      fontSize: 10, color: '#555',
      background: 'rgba(255,255,255,0.9)', borderRadius: 3,
      padding: '1px 5px', whiteSpace: 'nowrap',
      boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
      display: 'flex', alignItems: 'center', gap: 4,
    }}>
      {isSelected && (
        <button
          style={btnStyle}
          onPointerDown={(e) => { e.stopPropagation(); holdStartMinus() }}
          onPointerUp={holdStopMinus}
          onPointerLeave={holdStopMinus}
        >−</button>
      )}
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: resource.color, flexShrink: 0,
      }} />
      <span><span style={{ fontWeight: 600 }}>{resource.key}</span>: {resource.current}/{resource.max}</span>
      {isSelected && (
        <button
          style={btnStyle}
          onPointerDown={(e) => { e.stopPropagation(); holdStartPlus() }}
          onPointerUp={holdStopPlus}
          onPointerLeave={holdStopPlus}
        >+</button>
      )}
    </div>
  )
}
