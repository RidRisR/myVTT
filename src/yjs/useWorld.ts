// src/yjs/useWorld.ts
import { useMemo } from 'react'
import * as Y from 'yjs'

export interface WorldMaps {
  /** Y.Map of sceneId → Y.Map (each scene contains config keys, 'entities' Y.Map, 'tokens' Y.Map) */
  scenes: Y.Map<Y.Map<unknown>>
  /** Y.Map of entityId → Y.Map (cross-scene persistent characters, field-level CRDT) */
  roster: Y.Map<Y.Map<unknown>>
  /** Y.Map of blueprintId → plain Blueprint object */
  blueprints: Y.Map<unknown>
  /** Y.Map of seatId → plain Seat object */
  seats: Y.Map<unknown>
  /** Y.Map of room-level state (mode, activeSceneId, etc.) */
  room: Y.Map<unknown>
}

/**
 * Create WorldMaps using top-level shared types.
 * Uses yDoc.getMap which is guaranteed to return the same instance
 * across all clients, avoiding race conditions from nested Y.Map creation.
 */
export function createWorldMaps(yDoc: Y.Doc): WorldMaps {
  return {
    scenes: yDoc.getMap('scenes') as Y.Map<Y.Map<unknown>>,
    roster: yDoc.getMap('roster') as Y.Map<Y.Map<unknown>>,
    blueprints: yDoc.getMap('blueprints'),
    seats: yDoc.getMap('seats'),
    room: yDoc.getMap('room'),
  }
}

export function useWorld(yDoc: Y.Doc): WorldMaps {
  return useMemo(() => createWorldMaps(yDoc), [yDoc])
}
