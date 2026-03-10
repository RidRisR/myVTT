import { renderHook, act } from '@testing-library/react'
import * as Y from 'yjs'
import { useScenes, type Scene } from '../useScenes'
import { createTestDoc } from '../../__test-utils__/yjs-helpers'

function makeScene(overrides?: Partial<Scene>): Scene {
  return {
    id: 'scene-1',
    name: 'Tavern',
    atmosphereImageUrl: '/img/tavern.jpg',
    tacticalMapImageUrl: '',
    particlePreset: 'none',
    width: 1920,
    height: 1080,
    gridSize: 50,
    gridSnap: true,
    gridVisible: true,
    gridColor: 'rgba(255,255,255,0.15)',
    gridOffsetX: 0,
    gridOffsetY: 0,
    sortOrder: 0,
    combatActive: false,
    battleMapUrl: '',
    ...overrides,
  }
}

describe('useScenes', () => {
  function setup() {
    const { yDoc, scenes } = createTestDoc()
    const hook = renderHook(() => useScenes(scenes as Y.Map<Y.Map<unknown>>, yDoc))
    return { yDoc, scenes, hook }
  }

  // ── init ────────────────────────────────────────────────────

  it('starts with empty scenes', () => {
    const { hook } = setup()
    expect(hook.result.current.scenes).toEqual([])
  })

  // ── addScene ────────────────────────────────────────────────

  it('adds a scene', () => {
    const { hook } = setup()
    const scene = makeScene()

    act(() => hook.result.current.addScene(scene))

    expect(hook.result.current.scenes).toHaveLength(1)
    expect(hook.result.current.scenes[0].name).toBe('Tavern')
  })

  it('creates entityIds and tokens sub-maps on add', () => {
    const { hook, scenes } = setup()

    act(() => hook.result.current.addScene(makeScene({ id: 'sc-1' })))

    const sceneMap = scenes.get('sc-1')
    expect(sceneMap).toBeInstanceOf(Y.Map)
    expect(sceneMap?.get('entityIds')).toBeInstanceOf(Y.Map)
    expect(sceneMap?.get('tokens')).toBeInstanceOf(Y.Map)
  })

  it('sorts scenes by sortOrder', () => {
    const { hook } = setup()

    act(() => {
      hook.result.current.addScene(makeScene({ id: 's2', name: 'Forest', sortOrder: 2 }))
      hook.result.current.addScene(makeScene({ id: 's1', name: 'Tavern', sortOrder: 1 }))
      hook.result.current.addScene(makeScene({ id: 's3', name: 'Cave', sortOrder: 0 }))
    })

    expect(hook.result.current.scenes.map((s) => s.name)).toEqual(['Cave', 'Tavern', 'Forest'])
  })

  // ── updateScene ─────────────────────────────────────────────

  it('updates scene fields', () => {
    const { hook } = setup()
    act(() => hook.result.current.addScene(makeScene({ id: 'sc-1' })))

    act(() => hook.result.current.updateScene('sc-1', { name: 'Dark Tavern', gridSize: 100 }))

    const updated = hook.result.current.scenes[0]
    expect(updated.name).toBe('Dark Tavern')
    expect(updated.gridSize).toBe(100)
  })

  it('does not overwrite id on update', () => {
    const { hook } = setup()
    act(() => hook.result.current.addScene(makeScene({ id: 'sc-1' })))

    act(() => hook.result.current.updateScene('sc-1', { id: 'hacked' } as Partial<Scene>))

    expect(hook.result.current.scenes[0].id).toBe('sc-1')
  })

  // ── deleteScene ─────────────────────────────────────────────

  it('deletes a scene', () => {
    const { hook } = setup()
    act(() => hook.result.current.addScene(makeScene({ id: 'sc-1' })))
    expect(hook.result.current.scenes).toHaveLength(1)

    act(() => hook.result.current.deleteScene('sc-1'))

    expect(hook.result.current.scenes).toHaveLength(0)
  })

  // ── getScene ────────────────────────────────────────────────

  it('returns scene by id', () => {
    const { hook } = setup()
    act(() => hook.result.current.addScene(makeScene({ id: 'sc-1', name: 'Tavern' })))

    const scene = hook.result.current.getScene('sc-1')
    expect(scene?.name).toBe('Tavern')
    expect(scene?.gridSize).toBe(50)
  })

  it('returns null for null id', () => {
    const { hook } = setup()
    expect(hook.result.current.getScene(null)).toBeNull()
  })

  it('returns null for nonexistent id', () => {
    const { hook } = setup()
    expect(hook.result.current.getScene('nope')).toBeNull()
  })

  // ── addEntityToScene / removeEntityFromScene ──────────────────

  it('adds an entity to a scene', () => {
    const { hook } = setup()
    act(() => hook.result.current.addScene(makeScene({ id: 'sc-1' })))

    act(() => hook.result.current.addEntityToScene('sc-1', 'ent-1'))

    expect(hook.result.current.getSceneEntityIds('sc-1')).toContain('ent-1')
  })

  it('removes an entity from a scene', () => {
    const { hook } = setup()
    act(() => hook.result.current.addScene(makeScene({ id: 'sc-1' })))
    act(() => hook.result.current.addEntityToScene('sc-1', 'ent-1'))
    expect(hook.result.current.getSceneEntityIds('sc-1')).toContain('ent-1')

    act(() => hook.result.current.removeEntityFromScene('sc-1', 'ent-1'))

    expect(hook.result.current.getSceneEntityIds('sc-1')).not.toContain('ent-1')
  })

  it('no-ops addEntityToScene for nonexistent scene', () => {
    const { hook } = setup()
    // Should not throw
    act(() => hook.result.current.addEntityToScene('no-scene', 'ent-1'))
  })

  it('no-ops removeEntityFromScene for nonexistent scene', () => {
    const { hook } = setup()
    act(() => hook.result.current.removeEntityFromScene('no-scene', 'ent-1'))
  })

  // ── getSceneEntityIds ─────────────────────────────────────────

  it('returns empty array for nonexistent scene', () => {
    const { hook } = setup()
    expect(hook.result.current.getSceneEntityIds('nope')).toEqual([])
  })

  it('returns multiple entity IDs', () => {
    const { hook } = setup()
    act(() => hook.result.current.addScene(makeScene({ id: 'sc-1' })))
    act(() => {
      hook.result.current.addEntityToScene('sc-1', 'ent-1')
      hook.result.current.addEntityToScene('sc-1', 'ent-2')
      hook.result.current.addEntityToScene('sc-1', 'ent-3')
    })

    const ids = hook.result.current.getSceneEntityIds('sc-1')
    expect(ids).toHaveLength(3)
    expect(ids).toContain('ent-1')
    expect(ids).toContain('ent-2')
    expect(ids).toContain('ent-3')
  })

  // ── setCombatActive ───────────────────────────────────────────

  it('sets combatActive on a scene', () => {
    const { hook } = setup()
    act(() => hook.result.current.addScene(makeScene({ id: 'sc-1' })))
    expect(hook.result.current.getScene('sc-1')?.combatActive).toBe(false)

    act(() => hook.result.current.setCombatActive('sc-1', true))

    expect(hook.result.current.getScene('sc-1')?.combatActive).toBe(true)
  })

  it('no-ops setCombatActive for nonexistent scene', () => {
    const { hook } = setup()
    // Should not throw
    act(() => hook.result.current.setCombatActive('no-scene', true))
  })

  // ── addScene with persistentEntityIds ─────────────────────────

  it('adds persistent entity IDs when creating a scene', () => {
    const { hook } = setup()
    const scene = makeScene({ id: 'sc-1' })

    act(() => hook.result.current.addScene(scene, ['ent-a', 'ent-b']))

    const ids = hook.result.current.getSceneEntityIds('sc-1')
    expect(ids).toContain('ent-a')
    expect(ids).toContain('ent-b')
  })

  // ── updateScene no-op for nonexistent ─────────────────────────

  it('no-ops updateScene for nonexistent scene', () => {
    const { hook } = setup()
    // Should not throw
    act(() => hook.result.current.updateScene('no-scene', { name: 'Gone' }))
  })
})
