// src/yjs/useWorld.ts
import { useMemo } from 'react'
import * as Y from 'yjs'

export interface WorldMaps {
  /** Y.Map of sceneId → Y.Map (each scene contains atmosphere, entityIds Y.Map, encounters Y.Map) */
  scenes: Y.Map<Y.Map<unknown>>
  /** Y.Map of entityId → Y.Map (all entities, field-level CRDT) */
  entities: Y.Map<Y.Map<unknown>>
  /** Y.Map for active combat runtime state */
  combat: Y.Map<unknown>
  /** Y.Map for showcase items */
  showcase: Y.Map<unknown>
  /** Y.Map of seatId → plain Seat object */
  seats: Y.Map<unknown>
  /** Y.Map of room-level state (activeSceneId, activeEncounterId) */
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
    entities: yDoc.getMap('entities') as Y.Map<Y.Map<unknown>>,
    combat: yDoc.getMap('combat'),
    showcase: yDoc.getMap('showcase'),
    seats: yDoc.getMap('seats'),
    room: yDoc.getMap('room'),
  }
}

export function useWorld(yDoc: Y.Doc): WorldMaps {
  return useMemo(() => createWorldMaps(yDoc), [yDoc])
}
