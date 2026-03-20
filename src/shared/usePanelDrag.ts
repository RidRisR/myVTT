import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * Makes a fixed-positioned panel draggable by a handle.
 * Uses position:fixed + left/top (no transform) to avoid creating a CSS
 * containing block that would break child fixed positioning (e.g. Radix Portals).
 *
 * Pattern: posRef holds mutable position (read by drag handler),
 * pos state drives React re-renders. This keeps handleDragStart stable
 * (zero dependencies) and avoids re-creating the callback on every frame.
 *
 * Reference: PatternFloatingPanelOverlay.tsx
 */
export function usePanelDrag(initial = { x: 0, y: 0 }): {
  panelRef: React.RefObject<HTMLDivElement | null>
  pos: { x: number; y: number }
  setPos: Dispatch<SetStateAction<{ x: number; y: number }>>
  handleDragStart: (e: React.PointerEvent) => void
} {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const posRef = useRef(initial)
  const [pos, setPos] = useState(initial)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  // Keep posRef in sync with state (for external setPos calls like centering on open)
  const wrappedSetPos: Dispatch<SetStateAction<{ x: number; y: number }>> = useCallback(
    (action) => {
      setPos((prev) => {
        const next = typeof action === 'function' ? action(prev) : action
        posRef.current = next
        return next
      })
    },
    [],
  )

  // Clean up drag listeners on unmount
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
    }
  }, [])

  // Stable drag handler — no dependencies, reads position from ref
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    // Don't drag when clicking interactive elements inside the handle
    if (
      (e.target as HTMLElement).closest(
        'button, input, a, [role="button"], [data-radix-popper-content-wrapper]',
      )
    ) {
      return
    }
    e.preventDefault()

    const startX = e.clientX - posRef.current.x
    const startY = e.clientY - posRef.current.y

    const onMove = (ev: PointerEvent) => {
      const next = { x: ev.clientX - startX, y: ev.clientY - startY }
      posRef.current = next
      setPos(next)
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      dragCleanupRef.current = null
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    dragCleanupRef.current = onUp
  }, [])

  return { panelRef, pos, setPos: wrappedSetPos, handleDragStart }
}
