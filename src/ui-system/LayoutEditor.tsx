import { useRef, useCallback } from 'react'
import type { MouseEvent } from 'react'
import type { LayoutConfig, LayoutEntry } from './types'

// eslint-disable-next-line react-refresh/only-export-components
export function applyDrag(
  layout: LayoutConfig,
  instanceKey: string,
  delta: { dx: number; dy: number },
): LayoutConfig {
  const entry = layout[instanceKey]
  if (!entry) return layout

  const updated: LayoutEntry = {
    x: entry.x + delta.dx,
    y: entry.y + delta.dy,
    width: entry.width,
    height: entry.height,
    visible: entry.visible,
    instanceProps: entry.instanceProps,
  }
  return {
    ...layout,
    [instanceKey]: updated,
  }
}

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
      title={label}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        cursor: 'move',
        userSelect: 'none',
        border: '1.5px solid rgba(99,102,241,0.55)',
        borderRadius: 2,
      }}
    />
  )
}
