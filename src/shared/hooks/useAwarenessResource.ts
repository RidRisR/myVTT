// src/shared/hooks/useAwarenessResource.ts
// Broadcasts resource-drag state via Socket.io and listens for remote drags.

import { useState, useCallback, useEffect } from 'react'
import { useWorldStore } from '../../stores/worldStore'

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

/**
 * Hook that manages resource drag broadcasting and listening via Socket.io.
 */
export function useAwarenessResource(mySeatId: string | null, mySeatColor: string | null) {
  const [remoteEdits, setRemoteEdits] = useState<RemoteEditMap>(() => new Map())
  const socket = useWorldStore((s) => s._socket)

  // Listen for remote awareness events
  useEffect(() => {
    if (!socket) return

    const onEditing = (data: AwarenessResourceState) => {
      if (data.seatId === mySeatId) return // ignore own broadcasts
      setRemoteEdits((prev) => {
        const next = new Map(prev)
        next.set(`${data.entityId}:${data.field}`, data)
        return next
      })
    }

    const onClear = ({ seatId }: { seatId: string }) => {
      if (seatId === mySeatId) return
      setRemoteEdits((prev) => {
        const next = new Map(prev)
        let changed = false
        for (const [key, val] of next) {
          if (val.seatId === seatId) {
            next.delete(key)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }

    // Clean up stale entries when a remote peer disconnects
    const onRemove = ({ seatId }: { seatId: string }) => {
      onClear({ seatId })
    }

    socket.on('awareness:editing', onEditing)
    socket.on('awareness:clear', onClear)
    socket.on('awareness:remove', onRemove)

    return () => {
      socket.off('awareness:editing', onEditing)
      socket.off('awareness:clear', onClear)
      socket.off('awareness:remove', onRemove)
    }
  }, [socket, mySeatId])

  const broadcastEditing = useCallback(
    (entityId: string, field: string, value: number) => {
      if (!socket || !mySeatId) return
      socket.emit('awareness:editing', {
        entityId,
        field,
        value,
        seatId: mySeatId,
        color: mySeatColor ?? '#888',
      })
    },
    [socket, mySeatId, mySeatColor],
  )

  const clearEditing = useCallback(() => {
    if (!socket || !mySeatId) return
    socket.emit('awareness:clear', { seatId: mySeatId })
  }, [socket, mySeatId])

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
  return remoteEdits.get(`${entityId}:${field}`) ?? null
}
