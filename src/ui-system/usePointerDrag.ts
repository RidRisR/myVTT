/**
 * Create a pointerdown handler that tracks pointer movement as deltas.
 * Uses Pointer Events API with setPointerCapture for reliable cross-element tracking.
 * Positioning uses left/top (NOT transform) to avoid containing block issues.
 *
 * @param target - The element to capture pointer on and bind move/up listeners to.
 *   Must be passed explicitly because React 17+ delegates events to the root,
 *   so `e.currentTarget` on the native event is NOT the element with the handler.
 */
export function createPointerDragHandler(
  target: HTMLElement,
  onMove: (delta: { dx: number; dy: number }) => void,
  onEnd?: () => void,
): (e: PointerEvent) => void {
  return (e: PointerEvent) => {
    e.preventDefault()
    target.setPointerCapture(e.pointerId)

    let lastX = e.clientX
    let lastY = e.clientY

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - lastX
      const dy = ev.clientY - lastY
      lastX = ev.clientX
      lastY = ev.clientY
      onMove({ dx, dy })
    }

    const handleUp = () => {
      target.removeEventListener('pointermove', handleMove)
      target.removeEventListener('pointerup', handleUp)
      onEnd?.()
    }

    target.addEventListener('pointermove', handleMove)
    target.addEventListener('pointerup', handleUp)
  }
}

/**
 * Create a pointerdown handler for resize operations.
 * Tracks width/height deltas from the drag start point.
 *
 * @param target - The element to capture pointer on (see createPointerDragHandler).
 */
export function createPointerResizeHandler(
  target: HTMLElement,
  onResize: (delta: { dw: number; dh: number }) => void,
  onEnd?: () => void,
): (e: PointerEvent) => void {
  return (e: PointerEvent) => {
    e.preventDefault()
    target.setPointerCapture(e.pointerId)

    let lastX = e.clientX
    let lastY = e.clientY

    const handleMove = (ev: PointerEvent) => {
      const dw = ev.clientX - lastX
      const dh = ev.clientY - lastY
      lastX = ev.clientX
      lastY = ev.clientY
      onResize({ dw, dh })
    }

    const handleUp = () => {
      target.removeEventListener('pointermove', handleMove)
      target.removeEventListener('pointerup', handleUp)
      onEnd?.()
    }

    target.addEventListener('pointermove', handleMove)
    target.addEventListener('pointerup', handleUp)
  }
}
