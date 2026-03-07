import { useCallback, useRef, useState } from 'react'

/**
 * Shared drag-to-move logic for floating panels.
 *
 * Returns pos state + pointer event handlers to attach to the drag handle element.
 */
export function useDraggable(initial: { x: number; y: number }) {
  const [pos, setPos] = useState(initial)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input')) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    setPos({
      x: dragRef.current.origX + e.clientX - dragRef.current.startX,
      y: dragRef.current.origY + e.clientY - dragRef.current.startY,
    })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  return { pos, dragRef, handlePointerDown, handlePointerMove, handlePointerUp }
}
