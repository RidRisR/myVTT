import { useRef } from 'react'
import { useEditor, useValue, type Editor, type TLShapeId } from 'tldraw'
import { readPinModes } from './tokenUtils'

const HP_REGEX = /^(\d+)\/(\d+)$/

interface OverlayItem {
  id: TLShapeId
  name: string
  isActive: boolean
  alwaysProps: { key: string; value: string }[]
  rightSideProps: { key: string; value: string }[]
  propColors: Record<string, string>
  bottomX: number
  bottomY: number
  rightX: number
  rightY: number
  width: number
}

export function TokenOverlay() {
  const editor = useEditor()

  const overlays = useValue('tokenOverlays', () => {
    const hoveredId = editor.getHoveredShapeId()
    const selectedIds = editor.getSelectedShapeIds()

    // Get shapes sorted by z-order (bottom to top) for occlusion checks
    const sortedShapes = editor.getCurrentPageShapesSorted()

    const result: OverlayItem[] = []

    for (let si = 0; si < sortedShapes.length; si++) {
      const shape = sortedShapes[si]
      const name = (shape.meta?.name as string) ?? ''
      const nameDisplay = (shape.meta?.nameDisplay as string) ?? 'hidden'
      const properties = (shape.meta?.properties as { key: string; value: string }[]) ?? []
      const modes = readPinModes(shape.meta?.pinnedProps)
      const colors = (shape.meta?.propColors as Record<string, string>) ?? {}

      const isActive = shape.id === hoveredId || selectedIds.includes(shape.id)

      const alwaysProps = properties.filter((p) => modes[p.key] === 'always')
      const rightSideProps = isActive
        ? properties.filter((p) => modes[p.key] === 'hover' || modes[p.key] === 'always')
        : []

      // Determine if name should show based on nameDisplay mode
      const showName = name && (
        nameDisplay === 'always' ||
        (nameDisplay === 'hover' && isActive)
      )

      if (!showName && alwaysProps.length === 0 && rightSideProps.length === 0) continue

      const bounds = editor.getShapePageBounds(shape.id)
      if (!bounds) continue

      // Occlusion check: if not active, check if any shape above covers this one
      if (!isActive) {
        let occluded = false
        for (let j = si + 1; j < sortedShapes.length; j++) {
          const above = sortedShapes[j]
          const aboveBounds = editor.getShapePageBounds(above.id)
          if (!aboveBounds) continue
          // Check if the above shape covers most of this shape's center area
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

      // Skip labels for tiny tokens (unless selected/hovered)
      if (screenWidth < 50 && !isActive) continue

      result.push({
        id: shape.id,
        name: showName ? name : '',
        isActive,
        alwaysProps,
        rightSideProps,
        propColors: colors,
        bottomX: bottomCenter.x,
        bottomY: bottomCenter.y,
        rightX: topRight.x + 8,
        rightY: topRight.y,
        width: Math.max(screenWidth, 60),
      })
    }
    return result
  }, [editor])

  if (overlays.length === 0) return null

  return (
    <>
      {overlays.map((o) => (
        <div key={o.id}>
          {/* Bottom: name + always props */}
          {(o.name || o.alwaysProps.length > 0) && (
            <div
              style={{
                position: 'fixed',
                left: o.bottomX,
                top: o.bottomY,
                transform: 'translate(-50%, -100%)',
                pointerEvents: 'none',
                zIndex: o.isActive ? 99999 : 99998,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
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
              {o.alwaysProps.map((prop) => (
                <PinnedProp key={prop.key} prop={prop} barWidth={o.width} color={o.propColors[prop.key]} editor={editor} shapeId={o.id} />
              ))}
            </div>
          )}

          {/* Right side: hover props */}
          {o.rightSideProps.length > 0 && (
            <div
              style={{
                position: 'fixed',
                left: o.rightX,
                top: o.rightY,
                pointerEvents: 'none',
                zIndex: o.isActive ? 99999 : 99998,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                fontFamily: 'sans-serif',
              }}
            >
              {o.rightSideProps.map((prop) => {
                const dotColor = HP_REGEX.test(prop.value)
                  ? (o.propColors[prop.key] || barColorForKey(prop.key))
                  : null
                return (
                  <div key={prop.key} style={{
                    fontSize: 10, color: '#555',
                    background: 'rgba(255,255,255,0.9)', borderRadius: 3,
                    padding: '1px 5px', whiteSpace: 'nowrap',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {dotColor && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: dotColor, flexShrink: 0,
                      }} />
                    )}
                    <span><span style={{ fontWeight: 600 }}>{prop.key}</span>: {prop.value}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

const BAR_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899']

function barColorForKey(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0
  return BAR_COLORS[Math.abs(hash) % BAR_COLORS.length]
}

function PinnedProp({ prop, barWidth, color, editor, shapeId }: {
  prop: { key: string; value: string }; barWidth: number; color?: string;
  editor: Editor; shapeId: TLShapeId;
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const hpMatch = prop.value.match(HP_REGEX)
  if (hpMatch) {
    const current = parseInt(hpMatch[1])
    const max = parseInt(hpMatch[2])
    const pct = max > 0 ? Math.min(current / max, 1) : 0
    const baseColor = color || barColorForKey(prop.key)

    const updateValue = (newCurrent: number) => {
      const shape = editor.getShape(shapeId)
      if (!shape) return
      const properties = (shape.meta?.properties as { key: string; value: string }[]) ?? []
      const idx = properties.findIndex(p => p.key === prop.key)
      if (idx === -1) return
      const updated = [...properties]
      updated[idx] = { ...updated[idx], value: `${newCurrent}/${max}` }
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        meta: { ...shape.meta, properties: updated },
      })
    }

    const pctFromEvent = (e: React.PointerEvent) => {
      const bar = barRef.current
      if (!bar) return null
      const rect = bar.getBoundingClientRect()
      return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    }

    return (
      <div
        ref={barRef}
        style={{
          width: Math.max(barWidth * 0.8, 40), height: 8,
          background: 'rgba(0,0,0,0.15)', borderRadius: 4,
          overflow: 'hidden',
          pointerEvents: 'auto',
          cursor: 'ew-resize',
        }}
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const bar = barRef.current
          if (!bar || max <= 0) return
          bar.setPointerCapture(e.pointerId)
          dragging.current = true
          const p = pctFromEvent(e)
          if (p !== null) updateValue(Math.round(p * max))
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          const p = pctFromEvent(e)
          if (p !== null) updateValue(Math.round(p * max))
        }}
        onPointerUp={() => { dragging.current = false }}
      >
        <div style={{
          width: `${pct * 100}%`, height: '100%',
          background: baseColor, borderRadius: 4,
          transition: dragging.current ? 'none' : 'width 0.2s',
        }} />
      </div>
    )
  }
  return (
    <div style={{
      fontSize: 10, color: '#555',
      background: 'rgba(255,255,255,0.85)', borderRadius: 3,
      padding: '1px 5px', whiteSpace: 'nowrap',
    }}>
      <span style={{ fontWeight: 600 }}>{prop.key}</span>: {prop.value}
    </div>
  )
}
