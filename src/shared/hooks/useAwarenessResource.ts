// src/shared/hooks/useAwarenessResource.ts
// Broadcasts resource-drag state via Socket.io and listens for remote drags.
// TODO: Implement real-time Socket.io broadcasting (currently a no-op stub)

import { useState, useCallback } from 'react'

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
 * Hook that manages resource drag broadcasting and listening.
 * Currently a no-op stub — real-time broadcasting will be added via Socket.io events.
 */
export function useAwarenessResource(
  _mySeatId: string | null,
  _mySeatColor: string | null,
) {
  const [remoteEdits] = useState<RemoteEditMap>(() => new Map())

  const broadcastEditing = useCallback(
    (_entityId: string, _field: string, _value: number) => {
      // TODO: emit socket event for real-time drag broadcasting
    },
    [],
  )

  const clearEditing = useCallback(() => {
    // TODO: emit socket event to clear editing state
  }, [])

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
