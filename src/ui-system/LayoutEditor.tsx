import { useRef, useCallback } from 'react'
import type { MouseEvent } from 'react'

interface DragHandleProps {
  instanceKey: string
  label: string
  onDrag: (instanceKey: string, delta: { dx: number; dy: number }) => void
}

export function DragHandle({ instanceKey, label, onDrag }: DragHandleProps) {
  const startPos = useRef<{ x: number; y: number } | null>(null)

  const onMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      startPos.current = { x: e.clientX, y: e.clientY }

      // Type annotation omitted — TypeScript infers globalThis.MouseEvent from window.addEventListener
      const onMouseMove = (ev: globalThis.MouseEvent) => {
        if (!startPos.current) return
        const dx = ev.clientX - startPos.current.x
        const dy = ev.clientY - startPos.current.y
        startPos.current = { x: ev.clientX, y: ev.clientY }
        onDrag(instanceKey, { dx, dy })
      }

      const onMouseUp = () => {
        startPos.current = null
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [instanceKey, onDrag],
  )

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        background: 'rgba(99,102,241,0.8)',
        padding: '2px 8px',
        fontSize: 11,
        color: 'white',
        cursor: 'grab',
        userSelect: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.2)',
      }}
    >
      ⠿ {label}
    </div>
  )
}
