import * as Y from 'yjs'
import type { WorldMaps } from '../yjs/useWorld'

/**
 * Create an in-memory Y.Doc with the same structure as useWorld.
 * Mirrors the ensureSubMap/ensureSubArray logic from src/yjs/useWorld.ts.
 */
export function createTestDoc(): { yDoc: Y.Doc } & WorldMaps {
  const yDoc = new Y.Doc()
  const world = yDoc.getMap('world')

  const scenes = new Y.Map() as Y.Map<Y.Map<unknown>>
  const party = new Y.Map() as Y.Map<Y.Map<unknown>>
  const prepared = new Y.Map()
  const blueprints = new Y.Map()
  const seats = new Y.Map()
  const chat = new Y.Array()
  const room = new Y.Map()

  yDoc.transact(() => {
    world.set('scenes', scenes)
    world.set('party', party)
    world.set('prepared', prepared)
    world.set('blueprints', blueprints)
    world.set('seats', seats)
    world.set('chat', chat)
    world.set('room', room)
  })

  return { yDoc, world, scenes, party, prepared, blueprints, seats, chat, room }
}
