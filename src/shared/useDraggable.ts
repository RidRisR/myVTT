import { useRef, useCallback, type RefObject } from 'react'

/**
 * Makes a flex-centered element draggable by a handle.
 * Uses position:relative + left/top to avoid creating a CSS containing block
 * (which would break position:fixed children like @dnd-kit DragOverlay).
 * Direct DOM manipulation avoids re-renders on every pointer move.
 */
export function useDraggable(): {
  targetRef: RefObject<HTMLDivElement | null>
  handlePointerDown: (e: React.PointerEvent) => void
  resetPosition: () => void
} {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const offset = useRef({ x: 0, y: 0 })
  const start = useRef({ x: 0, y: 0 })

  const applyOffset = () => {
    if (!targetRef.current) return
    targetRef.current.style.position = 'relative'
    targetRef.current.style.left = `${offset.current.x}px`
    targetRef.current.style.top = `${offset.current.y}px`
  }

  const resetPosition = useCallback(() => {
    offset.current = { x: 0, y: 0 }
    if (targetRef.current) {
      targetRef.current.style.position = ''
      targetRef.current.style.left = ''
      targetRef.current.style.top = ''
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only primary button
    if (e.button !== 0) return
    // Don't drag if clicking interactive elements inside handle
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A') return

    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    start.current = { x: e.clientX - offset.current.x, y: e.clientY - offset.current.y }

    const onMove = (ev: PointerEvent) => {
      offset.current = { x: ev.clientX - start.current.x, y: ev.clientY - start.current.y }
      applyOffset()
    }

    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }, [])

  return { targetRef, handlePointerDown, resetPosition }
}
