import { type RefObject, useEffect } from 'react'

/**
 * Unified click-outside handler with Radix Portal compatibility.
 *
 * Replaces the repeated `document.addEventListener('pointerdown', ...)` +
 * `Node.contains()` pattern throughout the codebase. Includes automatic
 * detection of Radix Portal content so that clicking inside a Portal-rendered
 * overlay is NOT treated as an outside click.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return

    // Skip pointerdown events that occur in the same frame as mount.
    // Without this guard, a pointerdown that triggers the component to mount
    // could be caught by the newly registered listener if event dispatch
    // and effect execution overlap (e.g. React concurrent mode, or synthetic events).
    let armed = false
    const frameId = requestAnimationFrame(() => {
      armed = true
    })

    const handler = (e: PointerEvent) => {
      if (!armed) return
      const target = e.target as Element

      // Radix Portal content is rendered to <body>, so Node.contains() returns
      // false. Detect Radix popper wrappers and treat them as "inside".
      if (target.closest('[data-radix-popper-content-wrapper]')) return

      if (ref.current && !ref.current.contains(target as Node)) {
        onClose()
      }
    }

    document.addEventListener('pointerdown', handler)
    return () => {
      cancelAnimationFrame(frameId)
      document.removeEventListener('pointerdown', handler)
    }
  }, [ref, onClose, enabled])
}
