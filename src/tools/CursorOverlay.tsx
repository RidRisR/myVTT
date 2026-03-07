import { useState, useEffect } from 'react'
import type { Editor } from 'tldraw'
import type { Awareness } from 'y-protocols/awareness'

interface RemoteCursor {
  clientId: number
  name: string
  color: string
  x: number
  y: number
}

export function CursorOverlay({ editor, awareness }: { editor: Editor; awareness: Awareness }) {
  const [cursors, setCursors] = useState<RemoteCursor[]>([])

  useEffect(() => {
    const update = () => {
      const remote: RemoteCursor[] = []
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        if (state.seat && state.cursor) {
          remote.push({
            clientId,
            name: state.seat.name,
            color: state.seat.color,
            x: state.cursor.x,
            y: state.cursor.y,
          })
        }
      })
      setCursors(remote)
    }
    update()
    awareness.on('change', update)
    return () => awareness.off('change', update)
  }, [awareness])

  if (cursors.length === 0) return null

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 99996 }}>
      {cursors.map((c) => {
        const screen = editor.pageToScreen({ x: c.x, y: c.y })
        return (
          <g key={c.clientId} transform={`translate(${screen.x}, ${screen.y})`}>
            <path
              d="M0,0 L0,18 L4.5,13.5 L9,21 L12,19.5 L7.5,12 L13.5,12 Z"
              fill={c.color}
              stroke="white"
              strokeWidth={1.5}
            />
            <rect x={14} y={10} rx={4} ry={4}
              width={c.name.length * 7 + 8} height={18}
              fill={c.color} opacity={0.9}
            />
            <text x={18} y={22}
              fill="white" fontSize={11} fontWeight={600} fontFamily="sans-serif"
            >
              {c.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
