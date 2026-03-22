// src/ui-system/dnd.ts
import type { IDnDSDK, DnDPayload } from './types'

/**
 * Module-level active drag state.
 * Only one drag operation can be in-flight at a time.
 * Stored here so that onDragOver can read the payload — browsers restrict
 * dataTransfer.getData() to the drop event only (security sandbox).
 */
let activeDragPayload: DnDPayload | null = null

export function makeDnDSDK(): IDnDSDK {
  return {
    makeDraggable(payload) {
      return {
        draggable: true,
        onDragStart(e) {
          activeDragPayload = payload
          e.dataTransfer.setData('application/vtt-dnd', JSON.stringify(payload))
          e.dataTransfer.effectAllowed = 'move'
        },
        onDragEnd() {
          activeDragPayload = null
        },
      }
    },

    makeDropZone({ accept, canDrop, onEnter, onLeave, onDrop }) {
      return {
        onDragEnter() {
          const payload = activeDragPayload
          if (!payload) return
          if (accept.length > 0 && !accept.includes(payload.type)) return
          const canAccept = !canDrop || canDrop(payload)
          onEnter?.(canAccept)
        },
        onDragLeave() {
          onLeave?.()
        },
        onDragOver(e) {
          // activeDragPayload is available here even though getData() isn't
          const payload = activeDragPayload
          if (!payload) return
          if (accept.length > 0 && !accept.includes(payload.type)) return
          if (canDrop && !canDrop(payload)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        },
        onDrop(e) {
          e.preventDefault()
          const raw = e.dataTransfer.getData('application/vtt-dnd')
          if (!raw) return
          const payload = JSON.parse(raw) as DnDPayload
          if (accept.length > 0 && !accept.includes(payload.type)) return
          if (canDrop && !canDrop(payload)) return
          onDrop(payload)
          activeDragPayload = null
        },
      }
    },
  }
}
