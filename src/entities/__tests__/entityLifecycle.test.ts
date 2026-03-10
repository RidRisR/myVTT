import * as Y from 'yjs'
import {
  gcOrphanedEntities,
  addEntityToAllScenes,
  getPersistentEntityIds,
} from '../entityLifecycle'
import { createTestDoc, addSceneToDoc } from '../../__test-utils__/yjs-helpers'

/** Helper: add an entity Y.Map to the entities store */
function addEntity(yDoc: Y.Doc, yEntities: Y.Map<Y.Map<unknown>>, id: string, persistent: boolean) {
  yDoc.transact(() => {
    const yMap = new Y.Map<unknown>()
    yEntities.set(id, yMap)
    yMap.set('id', id)
    yMap.set('name', `Entity ${id}`)
    yMap.set('persistent', persistent)
  })
}

/** Helper: add an entity reference to a scene's entityIds */
function addEntityToScene(yScenes: Y.Map<Y.Map<unknown>>, sceneId: string, entityId: string) {
  const sceneMap = yScenes.get(sceneId) as Y.Map<unknown>
  const entityIds = sceneMap.get('entityIds') as Y.Map<boolean>
  entityIds.set(entityId, true)
}

describe('gcOrphanedEntities', () => {
  it('deletes non-persistent entities not referenced by any remaining scene', () => {
    const { yDoc, scenes, entities } = createTestDoc()
    addSceneToDoc(scenes, yDoc, 'scene-1')
    addSceneToDoc(scenes, yDoc, 'scene-2')
    addEntity(yDoc, entities, 'e1', false)
    addEntity(yDoc, entities, 'e2', false)
    addEntityToScene(scenes, 'scene-1', 'e1')
    addEntityToScene(scenes, 'scene-2', 'e1')
    addEntityToScene(scenes, 'scene-2', 'e2')

    // Delete scene-2 — e2 was only in scene-2
    const deletedSceneEntityIds = ['e1', 'e2']
    scenes.delete('scene-2')
    const deleted = gcOrphanedEntities(deletedSceneEntityIds, scenes, entities)

    expect(deleted).toEqual(['e2'])
    expect(entities.has('e1')).toBe(true)
    expect(entities.has('e2')).toBe(false)
  })

  it('keeps persistent entities even if unreferenced', () => {
    const { yDoc, scenes, entities } = createTestDoc()
    addSceneToDoc(scenes, yDoc, 'scene-1')
    addEntity(yDoc, entities, 'e1', true) // persistent
    addEntityToScene(scenes, 'scene-1', 'e1')

    // Delete scene-1 — e1 is persistent so should NOT be GC'd
    scenes.delete('scene-1')
    const deleted = gcOrphanedEntities(['e1'], scenes, entities)

    expect(deleted).toEqual([])
    expect(entities.has('e1')).toBe(true)
  })

  it('keeps entities still referenced by other scenes', () => {
    const { yDoc, scenes, entities } = createTestDoc()
    addSceneToDoc(scenes, yDoc, 'scene-1')
    addSceneToDoc(scenes, yDoc, 'scene-2')
    addEntity(yDoc, entities, 'e1', false)
    addEntityToScene(scenes, 'scene-1', 'e1')
    addEntityToScene(scenes, 'scene-2', 'e1')

    scenes.delete('scene-2')
    const deleted = gcOrphanedEntities(['e1'], scenes, entities)

    expect(deleted).toEqual([])
    expect(entities.has('e1')).toBe(true)
  })

  it('returns empty array when no entities to check', () => {
    const { yDoc, scenes, entities } = createTestDoc()
    addSceneToDoc(scenes, yDoc, 'scene-1')

    scenes.delete('scene-1')
    const deleted = gcOrphanedEntities([], scenes, entities)

    expect(deleted).toEqual([])
  })

  it('handles entity IDs that do not exist in entities store', () => {
    const { yDoc, scenes, entities } = createTestDoc()
    addSceneToDoc(scenes, yDoc, 'scene-1')

    scenes.delete('scene-1')
    const deleted = gcOrphanedEntities(['nonexistent'], scenes, entities)

    expect(deleted).toEqual([])
  })
})

describe('addEntityToAllScenes', () => {
  it('adds entity to all existing scenes', () => {
    const { yDoc, scenes } = createTestDoc()
    addSceneToDoc(scenes, yDoc, 'scene-1')
    addSceneToDoc(scenes, yDoc, 'scene-2')

    addEntityToAllScenes('e1', scenes)

    const ids1 = (scenes.get('scene-1') as Y.Map<unknown>).get('entityIds') as Y.Map<boolean>
    const ids2 = (scenes.get('scene-2') as Y.Map<unknown>).get('entityIds') as Y.Map<boolean>
    expect(ids1.has('e1')).toBe(true)
    expect(ids2.has('e1')).toBe(true)
  })

  it('does nothing when no scenes exist', () => {
    const { scenes } = createTestDoc()
    // Should not throw
    addEntityToAllScenes('e1', scenes)
  })
})

describe('getPersistentEntityIds', () => {
  it('returns IDs of persistent entities only', () => {
    const { yDoc, entities } = createTestDoc()
    addEntity(yDoc, entities, 'e1', true)
    addEntity(yDoc, entities, 'e2', false)
    addEntity(yDoc, entities, 'e3', true)

    const ids = getPersistentEntityIds(entities)
    expect(ids.sort()).toEqual(['e1', 'e3'])
  })

  it('returns empty array when no entities exist', () => {
    const { entities } = createTestDoc()
    expect(getPersistentEntityIds(entities)).toEqual([])
  })

  it('returns empty array when all entities are non-persistent', () => {
    const { yDoc, entities } = createTestDoc()
    addEntity(yDoc, entities, 'e1', false)
    addEntity(yDoc, entities, 'e2', false)

    expect(getPersistentEntityIds(entities)).toEqual([])
  })
})
