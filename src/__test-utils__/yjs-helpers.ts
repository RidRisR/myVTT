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
