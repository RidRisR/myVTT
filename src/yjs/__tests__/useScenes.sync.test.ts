import { renderHook, act } from '@testing-library/react'
import * as Y from 'yjs'
import { useScenes, type Scene } from '../useScenes'
import { createSyncedPair } from '../../__test-utils__/yjs-helpers'

const baseScene: Scene = {
  id: 'scene-1',
  name: 'Dungeon',
  atmosphereImageUrl: '/maps/dungeon.jpg',
  tacticalMapImageUrl: '',
  particlePreset: 'none',
  width: 1000,
  height: 1000,
  gridSize: 50,
  gridSnap: true,
  gridVisible: true,
  gridColor: 'rgba(255,255,255,0.15)',
  gridOffsetX: 0,
  gridOffsetY: 0,
  sortOrder: 0,
  ambientPreset: 'none',
  ambientAudioUrl: '',
  ambientAudioVolume: 0.5,
  combatActive: false,
  battleMapUrl: '',
  initiativeOrder: [],
  initiativeIndex: 0,
}

describe('useScenes — multi-client sync', () => {
  function setup() {
    const { doc1, doc2, world1, world2 } = createSyncedPair()
    const hook1 = renderHook(() => useScenes(world1.scenes, doc1))
    const hook2 = renderHook(() => useScenes(world2.scenes, doc2))
    return { doc1, doc2, world1, world2, hook1, hook2 }
  }

  it('Client A adds scene → Client B sees it with entityIds/tokens sub-maps', () => {
    const { hook1, hook2, world2 } = setup()

    act(() => hook1.result.current.addScene(baseScene))

    expect(hook2.result.current.scenes).toHaveLength(1)
    expect(hook2.result.current.scenes[0].name).toBe('Dungeon')

    // Verify nested containers synced
    const sceneMap = world2.scenes.get('scene-1')
    expect(sceneMap).toBeInstanceOf(Y.Map)
    expect((sceneMap as Y.Map<unknown>).get('entityIds')).toBeInstanceOf(Y.Map)
    expect((sceneMap as Y.Map<unknown>).get('tokens')).toBeInstanceOf(Y.Map)
  })

  it('Client A updates gridSize → Client B syncs', () => {
    const { hook1, hook2 } = setup()

    act(() => hook1.result.current.addScene(baseScene))
    act(() => hook1.result.current.updateScene('scene-1', { gridSize: 70 }))

    expect(hook2.result.current.scenes[0].gridSize).toBe(70)
  })

  it('Client A deletes scene → Client B syncs', () => {
    const { hook1, hook2 } = setup()

    act(() => hook1.result.current.addScene(baseScene))
    expect(hook2.result.current.scenes).toHaveLength(1)

    act(() => hook1.result.current.deleteScene('scene-1'))

    expect(hook1.result.current.scenes).toHaveLength(0)
    expect(hook2.result.current.scenes).toHaveLength(0)
  })
})
