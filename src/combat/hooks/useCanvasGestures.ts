// Gesture detection helpers for canvas interaction.
// Abstracted for future keybinding customization.

const DRAG_THRESHOLD = 5 // pixels

/** Right-click drag = pan (FVTT-style) */
export function isPanGesture(e: MouseEvent): boolean {
  return e.button === 2
}

/** Left-click = tool action */
export function isToolGesture(e: MouseEvent): boolean {
  return e.button === 0
}

/** Returns true if the pointer has moved beyond the drag threshold from start position */
export function isDragBeyondThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): boolean {
  const dx = currentX - startX
  const dy = currentY - startY
  return dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD
}
