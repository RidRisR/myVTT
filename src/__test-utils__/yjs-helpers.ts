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

  return {
    doc1,
    doc2,
    world1: createWorldMaps(doc1),
    world2: createWorldMaps(doc2),
  }
}

/**
 * Create two Y.Docs WITHOUT automatic sync.
 * Call flushSync() to manually propagate all pending updates.
 * Simulates network delay where operations happen concurrently.
 */
export function createDeferredPair(): {
  doc1: Y.Doc
  doc2: Y.Doc
  world1: WorldMaps
  world2: WorldMaps
  flushSync: () => void
} {
  const doc1 = new Y.Doc()
  const doc2 = new Y.Doc()

  const flushSync = () => {
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
  }

  return {
    doc1,
    doc2,
    world1: createWorldMaps(doc1),
    world2: createWorldMaps(doc2),
    flushSync,
  }
}

/** Add a scene with entityIds + tokens sub-maps to a scenes Y.Map */
export function addSceneToDoc(scenes: Y.Map<Y.Map<unknown>>, yDoc: Y.Doc, sceneId: string) {
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
    sceneMap.set('combatActive', false)
    sceneMap.set('battleMapUrl', '')
    sceneMap.set('entityIds', new Y.Map())
    sceneMap.set('tokens', new Y.Map())
  })
}
