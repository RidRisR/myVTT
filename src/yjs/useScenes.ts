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

function readScenes(yScenes: Y.Map<Scene>): Scene[] {
  const scenes: Scene[] = []
  yScenes.forEach((scene, _key) => {
    scenes.push(scene)
  })
  scenes.sort((a, b) => a.sortOrder - b.sortOrder)
  return scenes
}

export function useScenes(yDoc: Y.Doc) {
  const yScenes = yDoc.getMap<Scene>('scenes')
  const [scenes, setScenes] = useState<Scene[]>(() => readScenes(yScenes))

  useEffect(() => {
    setScenes(readScenes(yScenes))
    const observer = () => setScenes(readScenes(yScenes))
    yScenes.observe(observer)
    return () => yScenes.unobserve(observer)
  }, [yScenes])

  const addScene = (scene: Scene) => {
    yScenes.set(scene.id, scene)
  }

  const updateScene = (id: string, updates: Partial<Scene>) => {
    const existing = yScenes.get(id)
    if (existing) {
      yScenes.set(id, { ...existing, ...updates })
    }
  }

  const deleteScene = (id: string) => {
    yScenes.delete(id)
  }

  const getScene = (id: string | null): Scene | null => {
    if (!id) return null
    return yScenes.get(id) ?? null
  }

  return { scenes, addScene, updateScene, deleteScene, getScene }
}
