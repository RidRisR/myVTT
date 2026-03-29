import { useCallback } from 'react'
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
    zOrder: entry.zOrder,
    visible: entry.visible,
    instanceProps: entry.instanceProps,
  }
  return {
    ...layout,
    [instanceKey]: updated,
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function createDragInitiator(
  instanceKey: string,
  onDrag: (instanceKey: string, delta: { dx: number; dy: number }) => void,
): (e: { clientX: number; clientY: number; preventDefault(): void }) => void {
  return (e) => {
    e.preventDefault()
    let startPos = { x: e.clientX, y: e.clientY }

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      const dx = ev.clientX - startPos.x
      const dy = ev.clientY - startPos.y
      startPos = { x: ev.clientX, y: ev.clientY }
      onDrag(instanceKey, { dx, dy })
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }
}

interface DragHandleProps {
  instanceKey: string
  label: string
  onDrag: (instanceKey: string, delta: { dx: number; dy: number }) => void
}

export function DragHandle({ instanceKey, label, onDrag }: DragHandleProps) {
  const onMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      createDragInitiator(instanceKey, onDrag)(e)
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
