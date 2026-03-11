import { useEffect, useState } from 'react'
import * as Y from 'yjs'

export interface Scene {
  id: string
  name: string
  atmosphereImageUrl: string
  tacticalMapImageUrl: string
  particlePreset: string
  width: number
  height: number
  gridSize: number
  gridSnap: boolean
  gridVisible: boolean
  gridColor: string
  gridOffsetX: number
  gridOffsetY: number
  sortOrder: number
  combatActive: boolean
  battleMapUrl: string
  initiativeOrder: string[]
  initiativeIndex: number
}

function readScenes(yScenes: Y.Map<Y.Map<unknown>>): Scene[] {
  const scenes: Scene[] = []
  yScenes.forEach((sceneMap, id) => {
    if (!(sceneMap instanceof Y.Map)) return
    scenes.push({
      id,
      name: (sceneMap.get('name') as string) ?? '',
      atmosphereImageUrl:
        (sceneMap.get('atmosphereImageUrl') as string) ??
        (sceneMap.get('imageUrl') as string) ??
        '',
      tacticalMapImageUrl: (sceneMap.get('tacticalMapImageUrl') as string) ?? '',
      particlePreset: (sceneMap.get('particlePreset') as string) ?? 'none',
      width: (sceneMap.get('width') as number) ?? 0,
      height: (sceneMap.get('height') as number) ?? 0,
      gridSize: (sceneMap.get('gridSize') as number) ?? 50,
      gridSnap: (sceneMap.get('gridSnap') as boolean) ?? true,
      gridVisible: (sceneMap.get('gridVisible') as boolean) ?? true,
      gridColor: (sceneMap.get('gridColor') as string) ?? 'rgba(255,255,255,0.15)',
      gridOffsetX: (sceneMap.get('gridOffsetX') as number) ?? 0,
      gridOffsetY: (sceneMap.get('gridOffsetY') as number) ?? 0,
      sortOrder: (sceneMap.get('sortOrder') as number) ?? 0,
      combatActive: (sceneMap.get('combatActive') as boolean) ?? false,
      battleMapUrl: (sceneMap.get('battleMapUrl') as string) ?? '',
      initiativeOrder: (sceneMap.get('initiativeOrder') as string[]) ?? [],
      initiativeIndex: (sceneMap.get('initiativeIndex') as number) ?? 0,
    })
  })
  scenes.sort((a, b) => a.sortOrder - b.sortOrder)
  return scenes
}

export function useScenes(yScenes: Y.Map<Y.Map<unknown>>, yDoc: Y.Doc) {
  const [scenes, setScenes] = useState<Scene[]>(() => readScenes(yScenes))

  useEffect(() => {
    setScenes(readScenes(yScenes))
    const observer = () => setScenes(readScenes(yScenes))
    yScenes.observeDeep(observer)
    return () => yScenes.unobserveDeep(observer)
  }, [yScenes])

  const addScene = (scene: Scene, persistentEntityIds?: string[]) => {
    yDoc.transact(() => {
      const sceneMap = new Y.Map<unknown>()
      yScenes.set(scene.id, sceneMap)
      sceneMap.set('name', scene.name)
      sceneMap.set('atmosphereImageUrl', scene.atmosphereImageUrl)
      sceneMap.set('tacticalMapImageUrl', scene.tacticalMapImageUrl)
      sceneMap.set('particlePreset', scene.particlePreset)
      sceneMap.set('width', scene.width)
      sceneMap.set('height', scene.height)
      sceneMap.set('gridSize', scene.gridSize)
      sceneMap.set('gridSnap', scene.gridSnap)
      sceneMap.set('gridVisible', scene.gridVisible)
      sceneMap.set('gridColor', scene.gridColor)
      sceneMap.set('gridOffsetX', scene.gridOffsetX)
      sceneMap.set('gridOffsetY', scene.gridOffsetY)
      sceneMap.set('sortOrder', scene.sortOrder)
      sceneMap.set('combatActive', false)
      sceneMap.set('battleMapUrl', '')
      // entityIds: references to entities in this scene
      const entityIdsMap = new Y.Map<boolean>()
      sceneMap.set('entityIds', entityIdsMap)
      if (persistentEntityIds) {
        for (const eid of persistentEntityIds) {
          entityIdsMap.set(eid, true)
        }
      }
      // tokens: combat tokens for this scene
      sceneMap.set('tokens', new Y.Map())
    })
  }

  const updateScene = (id: string, updates: Partial<Scene>) => {
    const sceneMap = yScenes.get(id)
    if (!(sceneMap instanceof Y.Map)) return
    yDoc.transact(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id') continue
        sceneMap.set(key, value)
      }
    })
  }

  const deleteScene = (id: string) => {
    yScenes.delete(id)
  }

  const getScene = (id: string | null): Scene | null => {
    if (!id) return null
    const sceneMap = yScenes.get(id)
    if (!(sceneMap instanceof Y.Map)) return null
    return {
      id,
      name: (sceneMap.get('name') as string) ?? '',
      atmosphereImageUrl:
        (sceneMap.get('atmosphereImageUrl') as string) ??
        (sceneMap.get('imageUrl') as string) ??
        '',
      tacticalMapImageUrl: (sceneMap.get('tacticalMapImageUrl') as string) ?? '',
      particlePreset: (sceneMap.get('particlePreset') as string) ?? 'none',
      width: (sceneMap.get('width') as number) ?? 0,
      height: (sceneMap.get('height') as number) ?? 0,
      gridSize: (sceneMap.get('gridSize') as number) ?? 50,
      gridSnap: (sceneMap.get('gridSnap') as boolean) ?? true,
      gridVisible: (sceneMap.get('gridVisible') as boolean) ?? true,
      gridColor: (sceneMap.get('gridColor') as string) ?? 'rgba(255,255,255,0.15)',
      gridOffsetX: (sceneMap.get('gridOffsetX') as number) ?? 0,
      gridOffsetY: (sceneMap.get('gridOffsetY') as number) ?? 0,
      sortOrder: (sceneMap.get('sortOrder') as number) ?? 0,
      combatActive: (sceneMap.get('combatActive') as boolean) ?? false,
      battleMapUrl: (sceneMap.get('battleMapUrl') as string) ?? '',
      initiativeOrder: (sceneMap.get('initiativeOrder') as string[]) ?? [],
      initiativeIndex: (sceneMap.get('initiativeIndex') as number) ?? 0,
    }
  }

  const addEntityToScene = (sceneId: string, entityId: string) => {
    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return
    const entityIds = sceneMap.get('entityIds')
    if (entityIds instanceof Y.Map) {
      entityIds.set(entityId, true)
    }
  }

  const removeEntityFromScene = (sceneId: string, entityId: string) => {
    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return
    const entityIds = sceneMap.get('entityIds')
    if (entityIds instanceof Y.Map) {
      entityIds.delete(entityId)
    }
  }

  const getSceneEntityIds = (sceneId: string): string[] => {
    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return []
    const entityIds = sceneMap.get('entityIds')
    if (!(entityIds instanceof Y.Map)) return []
    const ids: string[] = []
    entityIds.forEach((_val, key) => ids.push(key))
    return ids
  }

  const setCombatActive = (sceneId: string, active: boolean) => {
    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return
    sceneMap.set('combatActive', active)
  }

  return {
    scenes,
    addScene,
    updateScene,
    deleteScene,
    getScene,
    addEntityToScene,
    removeEntityFromScene,
    getSceneEntityIds,
    setCombatActive,
  }
}
