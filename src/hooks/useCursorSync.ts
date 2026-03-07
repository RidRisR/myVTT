import { useEffect } from 'react'
import type { Editor } from 'tldraw'
import type { Awareness } from 'y-protocols/awareness'

export function useCursorSync(editor: Editor | null, awareness: Awareness | null) {
  useEffect(() => {
    if (!editor || !awareness) return

    let lastX = 0, lastY = 0
    let rafId = 0

    const broadcast = () => {
      const point = editor.inputs.currentPagePoint
      if (Math.abs(point.x - lastX) > 1 || Math.abs(point.y - lastY) > 1) {
        lastX = point.x
        lastY = point.y
        awareness.setLocalStateField('cursor', { x: point.x, y: point.y })
      }
    }

    const onPointerMove = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(broadcast)
    }

    const onPointerLeave = () => {
      awareness.setLocalStateField('cursor', null)
    }

    const container = editor.getContainer()
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerleave', onPointerLeave)

    return () => {
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerleave', onPointerLeave)
      cancelAnimationFrame(rafId)
      awareness.setLocalStateField('cursor', null)
    }
  }, [editor, awareness])
}
