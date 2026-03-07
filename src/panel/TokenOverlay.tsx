import { useEditor, useValue } from 'tldraw'
import { readPinModes } from './tokenUtils'

const HP_REGEX = /^(\d+)\/(\d+)$/

interface OverlayItem {
  id: string
  name: string
  alwaysProps: { key: string; value: string }[]
  hoverProps: { key: string; value: string }[]
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

    const result: OverlayItem[] = []

    for (const shape of editor.getCurrentPageShapes()) {
      const name = (shape.meta?.name as string) ?? ''
      const nameDisplay = (shape.meta?.nameDisplay as string) ?? 'hidden'
      const properties = (shape.meta?.properties as { key: string; value: string }[]) ?? []
      const modes = readPinModes(shape.meta?.pinnedProps)

      const isActive = shape.id === hoveredId || selectedIds.includes(shape.id)

      const alwaysProps = properties.filter((p) => modes[p.key] === 'always')
      const hoverProps = isActive
        ? properties.filter((p) => modes[p.key] === 'hover')
        : []

      // Determine if name should show based on nameDisplay mode
      const showName = name && (
        nameDisplay === 'always' ||
        (nameDisplay === 'hover' && isActive)
      )

      if (!showName && alwaysProps.length === 0 && hoverProps.length === 0) continue

      const bounds = editor.getShapePageBounds(shape.id)
      if (!bounds) continue

      const bottomCenter = editor.pageToScreen({ x: bounds.midX, y: bounds.maxY })
      const topRight = editor.pageToScreen({ x: bounds.maxX, y: bounds.minY })
      const screenWidth = bounds.width * editor.getZoomLevel()

      result.push({
        id: shape.id,
        name: showName ? name : '',
        alwaysProps,
        hoverProps,
        bottomX: bottomCenter.x,
        bottomY: bottomCenter.y + 4,
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
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
                zIndex: 99998,
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
                <PinnedProp key={prop.key} prop={prop} barWidth={o.width} />
              ))}
            </div>
          )}

          {/* Right side: hover props */}
          {o.hoverProps.length > 0 && (
            <div
              style={{
                position: 'fixed',
                left: o.rightX,
                top: o.rightY,
                pointerEvents: 'none',
                zIndex: 99998,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                fontFamily: 'sans-serif',
              }}
            >
              {o.hoverProps.map((prop) => (
                <div key={prop.key} style={{
                  fontSize: 10, color: '#555',
                  background: 'rgba(255,255,255,0.9)', borderRadius: 3,
                  padding: '1px 5px', whiteSpace: 'nowrap',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                }}>
                  <span style={{ fontWeight: 600 }}>{prop.key}</span>: {prop.value}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

function PinnedProp({ prop, barWidth }: { prop: { key: string; value: string }; barWidth: number }) {
  const hpMatch = prop.value.match(HP_REGEX)
  if (hpMatch) {
    const current = parseInt(hpMatch[1])
    const max = parseInt(hpMatch[2])
    const pct = max > 0 ? Math.min(current / max, 1) : 0
    const barColor = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#f59e0b' : '#ef4444'
    return (
      <div style={{
        width: Math.max(barWidth * 0.8, 40),
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          width: '100%', height: 6,
          background: 'rgba(0,0,0,0.15)', borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct * 100}%`, height: '100%',
            background: barColor, borderRadius: 3,
            transition: 'width 0.2s',
          }} />
        </div>
        <span style={{
          fontSize: 9, color: '#666',
          background: 'rgba(255,255,255,0.8)', borderRadius: 2,
          padding: '0 3px', marginTop: 1,
        }}>
          {prop.value}
        </span>
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
