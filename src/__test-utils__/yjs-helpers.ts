import * as Y from 'yjs'
import { createWorldMaps } from '../yjs/useWorld'
import type { WorldMaps } from '../yjs/useWorld'

/**
 * Create an in-memory Y.Doc with the same structure as useWorld.
 * Uses createWorldMaps directly to ensure test setup matches production.
 */
export function createTestDoc(): { yDoc: Y.Doc } & WorldMaps {
  const yDoc = new Y.Doc()
  return { yDoc, ...createWorldMaps(yDoc) }
}

function buildWorldMaps(yDoc: Y.Doc): WorldMaps {
  const world = yDoc.getMap('world')
  return {
    world,
    scenes: world.get('scenes') as Y.Map<Y.Map<unknown>>,
    party: world.get('party') as Y.Map<Y.Map<unknown>>,
    prepared: world.get('prepared') as Y.Map<unknown>,
    blueprints: world.get('blueprints') as Y.Map<unknown>,
    seats: world.get('seats') as Y.Map<unknown>,
    chat: world.get('chat') as Y.Array<unknown>,
    room: world.get('room') as Y.Map<unknown>,
  }
}

/**
 * Create two Y.Docs with bidirectional sync via Y.applyUpdate.
 * Simulates two clients connected to the same room without real WebSocket.
 */
export function createSyncedPair(): {
  doc1: Y.Doc
  doc2: Y.Doc
  world1: WorldMaps
  world2: WorldMaps
} {
  const doc1 = new Y.Doc()
  const doc2 = new Y.Doc()

  // Bidirectional sync
  doc1.on('update', (update: Uint8Array) => Y.applyUpdate(doc2, update))
  doc2.on('update', (update: Uint8Array) => Y.applyUpdate(doc1, update))

  // Initialize world structure on doc1 (auto-syncs to doc2)
  const world1Root = doc1.getMap('world')
  doc1.transact(() => {
    world1Root.set('scenes', new Y.Map())
    world1Root.set('party', new Y.Map())
    world1Root.set('prepared', new Y.Map())
    world1Root.set('blueprints', new Y.Map())
    world1Root.set('seats', new Y.Map())
    world1Root.set('chat', new Y.Array())
    world1Root.set('room', new Y.Map())
  })

  return {
    doc1,
    doc2,
    world1: buildWorldMaps(doc1),
    world2: buildWorldMaps(doc2),
  }
}

/** Add a scene with entities + tokens sub-maps to a scenes Y.Map */
export function addSceneToDoc(
  scenes: Y.Map<Y.Map<unknown>>,
  yDoc: Y.Doc,
  sceneId: string,
) {
  yDoc.transact(() => {
    const sceneMap = new Y.Map<unknown>()
    scenes.set(sceneId, sceneMap)
    sceneMap.set('name', 'Test Scene')
    sceneMap.set('imageUrl', '')
    sceneMap.set('width', 1000)
    sceneMap.set('height', 1000)
    sceneMap.set('gridSize', 50)
    sceneMap.set('gridVisible', true)
    sceneMap.set('gridColor', 'rgba(255,255,255,0.15)')
    sceneMap.set('gridOffsetX', 0)
    sceneMap.set('gridOffsetY', 0)
    sceneMap.set('sortOrder', 0)
    sceneMap.set('entities', new Y.Map())
    sceneMap.set('tokens', new Y.Map())
  })
}
