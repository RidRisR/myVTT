// src/yjs/useWorld.ts
import { useMemo } from 'react'
import * as Y from 'yjs'

export interface WorldMaps {
  /** Top-level world map */
  world: Y.Map<unknown>
  /** Y.Map of sceneId → Y.Map (each scene contains config keys, 'entities' Y.Map, 'tokens' Y.Map) */
  scenes: Y.Map<Y.Map<unknown>>
  /** Y.Map of entityId → Y.Map (PC entities, field-level CRDT) */
  party: Y.Map<Y.Map<unknown>>
  /** Y.Map of entityId → plain Entity object (GM staging area) */
  prepared: Y.Map<unknown>
  /** Y.Map of blueprintId → plain Blueprint object */
  blueprints: Y.Map<unknown>
  /** Y.Map of seatId → plain Seat object */
  seats: Y.Map<unknown>
  /** Y.Array of ChatMessage objects */
  chat: Y.Array<unknown>
  /** Y.Map of room-level state (mode, activeSceneId, etc.) */
  room: Y.Map<unknown>
}

/**
 * Create WorldMaps using top-level shared types.
 * Uses yDoc.getMap/getArray which are guaranteed to return the same instance
 * across all clients, avoiding race conditions from nested Y.Map creation.
 */
export function createWorldMaps(yDoc: Y.Doc): WorldMaps {
  return {
    world: yDoc.getMap('world'),
    scenes: yDoc.getMap('world:scenes') as Y.Map<Y.Map<unknown>>,
    party: yDoc.getMap('world:party') as Y.Map<Y.Map<unknown>>,
    prepared: yDoc.getMap('world:prepared'),
    blueprints: yDoc.getMap('world:blueprints'),
    seats: yDoc.getMap('world:seats'),
    chat: yDoc.getArray('world:chat') as Y.Array<unknown>,
    room: yDoc.getMap('world:room'),
  }
}

export function useWorld(yDoc: Y.Doc): WorldMaps {
  return useMemo(() => createWorldMaps(yDoc), [yDoc])
}
