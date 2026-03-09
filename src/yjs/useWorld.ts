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

function ensureSubMap(parent: Y.Map<unknown>, key: string, doc: Y.Doc): Y.Map<unknown> {
  const existing = parent.get(key)
  if (existing instanceof Y.Map) return existing
  const created = new Y.Map()
  doc.transact(() => {
    parent.set(key, created)
  })
  return created
}

function ensureSubArray(parent: Y.Map<unknown>, key: string, doc: Y.Doc): Y.Array<unknown> {
  const existing = parent.get(key)
  if (existing instanceof Y.Array) return existing
  const created = new Y.Array()
  doc.transact(() => {
    parent.set(key, created)
  })
  return created
}

export function useWorld(yDoc: Y.Doc): WorldMaps {
  return useMemo(() => {
    const world = yDoc.getMap('world')
    return {
      world,
      scenes: ensureSubMap(world, 'scenes', yDoc) as Y.Map<Y.Map<unknown>>,
      party: ensureSubMap(world, 'party', yDoc) as Y.Map<Y.Map<unknown>>,
      prepared: ensureSubMap(world, 'prepared', yDoc),
      blueprints: ensureSubMap(world, 'blueprints', yDoc),
      seats: ensureSubMap(world, 'seats', yDoc),
      chat: ensureSubArray(world, 'chat', yDoc) as Y.Array<unknown>,
      room: ensureSubMap(world, 'room', yDoc),
    }
  }, [yDoc])
}
