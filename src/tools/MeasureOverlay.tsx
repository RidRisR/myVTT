import { useValue, type Editor } from 'tldraw'
import { measurePoints } from './MeasureTool'

export function MeasureOverlay({ editor }: { editor: Editor }) {
  const points = useValue(measurePoints)

  if (!points) return null

  const screenStart = editor.pageToScreen(points.start)
  const screenEnd = editor.pageToScreen(points.end)

  const dx = points.end.x - points.start.x
  const dy = points.end.y - points.start.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  if (distance < 2) return null

  // Convert page distance to grid squares
  const gridSize = editor.getDocumentSettings().gridSize
  const gridDistance = distance / gridSize

  const midX = (screenStart.x + screenEnd.x) / 2
  const midY = (screenStart.y + screenEnd.y) / 2

  const label = gridDistance < 10
    ? gridDistance.toFixed(1)
    : Math.round(gridDistance).toString()

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 99997 }}>
      <line
        x1={screenStart.x} y1={screenStart.y}
        x2={screenEnd.x} y2={screenEnd.y}
        stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4"
      />
      <circle cx={midX} cy={midY} r={18} fill="rgba(37,99,235,0.9)" />
      <text
        x={midX} y={midY}
        textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize={11} fontWeight={700} fontFamily="sans-serif"
      >
        {label}
      </text>
    </svg>
  )
}
