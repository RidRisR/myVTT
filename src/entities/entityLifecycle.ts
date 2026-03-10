import * as Y from 'yjs'

/**
 * After deleting a scene, garbage-collect non-persistent entities
 * that are no longer referenced by any remaining scene.
 * Call this AFTER the scene has been deleted from yScenes.
 */
export function gcOrphanedEntities(
  deletedSceneEntityIds: string[],
  yScenes: Y.Map<Y.Map<unknown>>,
  yEntities: Y.Map<Y.Map<unknown>>,
): string[] {
  // Collect all entity IDs still referenced by remaining scenes
  const referenced = new Set<string>()
  yScenes.forEach((sceneMap) => {
    if (!(sceneMap instanceof Y.Map)) return
    const entityIds = sceneMap.get('entityIds')
    if (entityIds instanceof Y.Map) {
      entityIds.forEach((_val, key) => referenced.add(key))
    }
  })

  // Delete non-persistent, unreferenced entities
  const deleted: string[] = []
  for (const id of deletedSceneEntityIds) {
    if (referenced.has(id)) continue
    const yMap = yEntities.get(id)
    if (!(yMap instanceof Y.Map)) continue
    const persistent = (yMap.get('persistent') as boolean) ?? false
    if (!persistent) {
      yEntities.delete(id)
      deleted.push(id)
    }
  }
  return deleted
}

/**
 * Add an entity to all existing scenes' entityIds.
 * Used when creating a persistent entity.
 */
export function addEntityToAllScenes(entityId: string, yScenes: Y.Map<Y.Map<unknown>>) {
  yScenes.forEach((sceneMap) => {
    if (!(sceneMap instanceof Y.Map)) return
    const entityIds = sceneMap.get('entityIds')
    if (entityIds instanceof Y.Map) {
      entityIds.set(entityId, true)
    }
  })
}

/**
 * Get IDs of all persistent entities from the global entities store.
 */
export function getPersistentEntityIds(yEntities: Y.Map<Y.Map<unknown>>): string[] {
  const ids: string[] = []
  yEntities.forEach((yMap, id) => {
    if (!(yMap instanceof Y.Map)) return
    if ((yMap.get('persistent') as boolean) === true) {
      ids.push(id)
    }
  })
  return ids
}
