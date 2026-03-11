// src/shared/hooks/useAwarenessResource.ts
// Broadcasts resource-drag awareness state and listens for remote drags.
// During drag: broadcasts { entityId, field, value, seatId, color } at ~20fps.
// On pointerUp: clears awareness state.
// Consumers read `remoteEdits` to show live drag values and soft-lock indicators.

import { useEffect, useState, useCallback, useRef } from 'react'
import type { Awareness } from 'y-protocols/awareness'

export interface AwarenessResourceState {
  entityId: string
  /** resource index as string, e.g. "0", "1" */
  field: string
  value: number
  seatId: string
  color: string
}

/** Keyed by `${entityId}:${field}` */
export type RemoteEditMap = Map<string, AwarenessResourceState>

const AWARENESS_FIELD = 'resourceDrag'
const THROTTLE_MS = 16 // ~60fps

function remoteEditKey(entityId: string, field: string): string {
  return `${entityId}:${field}`
}

/**
 * Hook that manages awareness-based resource drag broadcasting and listening.
 *
 * - `broadcastEditing(entityId, field, value)`: call on every drag move (throttled internally to ~60fps)
 * - `clearEditing()`: call on pointerUp
 * - `remoteEdits`: Map of currently active remote resource drags
 */
export function useAwarenessResource(
  awareness: Awareness | null,
  mySeatId: string | null,
  mySeatColor: string | null,
) {
  const [remoteEdits, setRemoteEdits] = useState<RemoteEditMap>(() => new Map())
  const lastBroadcastRef = useRef(0)
  const pendingBroadcastRef = useRef<{
    entityId: string
    field: string
    value: number
    timeoutId: number
  } | null>(null)

  // Broadcast that the local user is dragging a resource
  const broadcastEditing = useCallback(
    (entityId: string, field: string, value: number) => {
      if (!awareness || !mySeatId) return

      const now = Date.now()
      const timeSinceLastBroadcast = now - lastBroadcastRef.current

      const broadcast = () => {
        lastBroadcastRef.current = Date.now()
        awareness.setLocalStateField(AWARENESS_FIELD, {
          entityId,
          field,
          value,
          seatId: mySeatId,
          color: mySeatColor ?? '#3b82f6',
        } satisfies AwarenessResourceState)
      }

      // If enough time has passed, broadcast immediately
      if (timeSinceLastBroadcast >= THROTTLE_MS) {
        broadcast()
        // Clear any pending broadcast since we just sent one
        if (pendingBroadcastRef.current) {
          clearTimeout(pendingBroadcastRef.current.timeoutId)
          pendingBroadcastRef.current = null
        }
      } else {
        // Schedule a deferred broadcast to ensure the last value is always sent
        if (pendingBroadcastRef.current) {
          clearTimeout(pendingBroadcastRef.current.timeoutId)
        }
        const timeoutId = window.setTimeout(() => {
          broadcast()
          pendingBroadcastRef.current = null
        }, THROTTLE_MS - timeSinceLastBroadcast)
        pendingBroadcastRef.current = { entityId, field, value, timeoutId }
      }
    },
    [awareness, mySeatId, mySeatColor],
  )

  // Clear the local editing state (call on pointerUp)
  const clearEditing = useCallback(() => {
    if (!awareness) return
    // Clear any pending broadcast
    if (pendingBroadcastRef.current) {
      clearTimeout(pendingBroadcastRef.current.timeoutId)
      pendingBroadcastRef.current = null
    }
    awareness.setLocalStateField(AWARENESS_FIELD, null)
  }, [awareness])

  // Listen for remote clients' editing states
  useEffect(() => {
    if (!awareness) return

    const update = () => {
      const next: RemoteEditMap = new Map()
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        const drag = state[AWARENESS_FIELD] as AwarenessResourceState | null | undefined
        if (drag && drag.entityId && drag.field != null) {
          next.set(remoteEditKey(drag.entityId, drag.field), drag)
        }
      })
      setRemoteEdits(next)
    }

    // Initial read
    update()
    awareness.on('change', update)
    return () => {
      awareness.off('change', update)
    }
  }, [awareness])

  return { broadcastEditing, clearEditing, remoteEdits }
}

/**
 * Get a remote edit for a specific entity + field (resource index).
 * Returns null if no remote user is currently editing.
 */
export function getRemoteEdit(
  remoteEdits: RemoteEditMap,
  entityId: string,
  field: string,
): AwarenessResourceState | null {
  return remoteEdits.get(remoteEditKey(entityId, field)) ?? null
}
