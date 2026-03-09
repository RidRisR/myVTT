import { useEffect, useState } from 'react'
import * as Y from 'yjs'

export interface Scene {
  id: string
  name: string
  imageUrl: string
  width: number
  height: number
  gridSize: number
  gridVisible: boolean
  gridColor: string
  gridOffsetX: number
  gridOffsetY: number
  sortOrder: number
}

function readScenes(yScenes: Y.Map<Y.Map<unknown>>): Scene[] {
  const scenes: Scene[] = []
  yScenes.forEach((sceneMap, id) => {
    if (!(sceneMap instanceof Y.Map)) return
    scenes.push({
      id,
      name: (sceneMap.get('name') as string) ?? '',
      imageUrl: (sceneMap.get('imageUrl') as string) ?? '',
      width: (sceneMap.get('width') as number) ?? 0,
      height: (sceneMap.get('height') as number) ?? 0,
      gridSize: (sceneMap.get('gridSize') as number) ?? 50,
      gridVisible: (sceneMap.get('gridVisible') as boolean) ?? true,
      gridColor: (sceneMap.get('gridColor') as string) ?? 'rgba(255,255,255,0.15)',
      gridOffsetX: (sceneMap.get('gridOffsetX') as number) ?? 0,
      gridOffsetY: (sceneMap.get('gridOffsetY') as number) ?? 0,
      sortOrder: (sceneMap.get('sortOrder') as number) ?? 0,
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

  const addScene = (scene: Scene) => {
    yDoc.transact(() => {
      const sceneMap = new Y.Map<unknown>()
      yScenes.set(scene.id, sceneMap)
      sceneMap.set('name', scene.name)
      sceneMap.set('imageUrl', scene.imageUrl)
      sceneMap.set('width', scene.width)
      sceneMap.set('height', scene.height)
      sceneMap.set('gridSize', scene.gridSize)
      sceneMap.set('gridVisible', scene.gridVisible)
      sceneMap.set('gridColor', scene.gridColor)
      sceneMap.set('gridOffsetX', scene.gridOffsetX)
      sceneMap.set('gridOffsetY', scene.gridOffsetY)
      sceneMap.set('sortOrder', scene.sortOrder)
      // Nested containers for entities and tokens
      sceneMap.set('entities', new Y.Map())
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
      imageUrl: (sceneMap.get('imageUrl') as string) ?? '',
      width: (sceneMap.get('width') as number) ?? 0,
      height: (sceneMap.get('height') as number) ?? 0,
      gridSize: (sceneMap.get('gridSize') as number) ?? 50,
      gridVisible: (sceneMap.get('gridVisible') as boolean) ?? true,
      gridColor: (sceneMap.get('gridColor') as string) ?? 'rgba(255,255,255,0.15)',
      gridOffsetX: (sceneMap.get('gridOffsetX') as number) ?? 0,
      gridOffsetY: (sceneMap.get('gridOffsetY') as number) ?? 0,
      sortOrder: (sceneMap.get('sortOrder') as number) ?? 0,
    }
  }

  return { scenes, addScene, updateScene, deleteScene, getScene }
}
