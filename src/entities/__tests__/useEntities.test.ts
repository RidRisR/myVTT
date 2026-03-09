import { renderHook, act } from '@testing-library/react'
import * as Y from 'yjs'
import { useEntities } from '../useEntities'
import { createTestDoc } from '../../__test-utils__/yjs-helpers'
import { makeEntity } from '../../__test-utils__/fixtures'

/** Helper: create a scene with entities + tokens sub-maps */
function addSceneToDoc(scenes: Y.Map<Y.Map<unknown>>, yDoc: Y.Doc, sceneId: string) {
  yDoc.transact(() => {
    const sceneMap = new Y.Map<unknown>()
    scenes.set(sceneId, sceneMap)
    sceneMap.set('name', 'Test Scene')
    sceneMap.set('entities', new Y.Map())
    sceneMap.set('tokens', new Y.Map())
  })
}

describe('useEntities', () => {
  const sceneId = 'scene-1'

  function setup(currentSceneId: string | null = sceneId) {
    const { yDoc, ...world } = createTestDoc()
    addSceneToDoc(world.scenes as Y.Map<Y.Map<unknown>>, yDoc, sceneId)
    const hook = renderHook(() => useEntities(world, currentSceneId, yDoc))
    return { yDoc, world, hook }
  }

  // ── init ────────────────────────────────────────────────────

  it('starts with empty entities', () => {
    const { hook } = setup()
    expect(hook.result.current.entities).toEqual([])
  })

  // ── addPartyEntity ──────────────────────────────────────────

  it('adds a party entity', () => {
    const { hook } = setup()
    const entity = makeEntity({ id: 'pc-1', name: 'Fighter' })

    act(() => hook.result.current.addPartyEntity(entity))

    const found = hook.result.current.entities.find((e) => e.id === 'pc-1')
    expect(found).toBeDefined()
    expect(found?.name).toBe('Fighter')
  })

  // ── addPreparedEntity ───────────────────────────────────────

  it('adds a prepared entity', () => {
    const { hook } = setup()
    const entity = makeEntity({ id: 'npc-1', name: 'Goblin' })

    act(() => hook.result.current.addPreparedEntity(entity))

    const found = hook.result.current.entities.find((e) => e.id === 'npc-1')
    expect(found).toBeDefined()
    expect(found?.name).toBe('Goblin')
  })

  // ── addSceneEntity ──────────────────────────────────────────

  it('adds a scene entity', () => {
    const { hook } = setup()
    const entity = makeEntity({ id: 'se-1', name: 'Chest' })

    act(() => hook.result.current.addSceneEntity(entity))

    const found = hook.result.current.entities.find((e) => e.id === 'se-1')
    expect(found).toBeDefined()
    expect(found?.name).toBe('Chest')
  })

  // ── updateEntity (auto-detect source) ───────────────────────

  it('updates a party entity', () => {
    const { hook } = setup()
    act(() => hook.result.current.addPartyEntity(makeEntity({ id: 'pc-1', name: 'Fighter' })))

    act(() => hook.result.current.updateEntity('pc-1', { name: 'Paladin' }))

    expect(hook.result.current.entities.find((e) => e.id === 'pc-1')?.name).toBe('Paladin')
  })

  it('updates a prepared entity', () => {
    const { hook } = setup()
    act(() => hook.result.current.addPreparedEntity(makeEntity({ id: 'npc-1', name: 'Goblin' })))

    act(() => hook.result.current.updateEntity('npc-1', { name: 'Hobgoblin' }))

    expect(hook.result.current.entities.find((e) => e.id === 'npc-1')?.name).toBe('Hobgoblin')
  })

  it('updates a scene entity', () => {
    const { hook } = setup()
    act(() => hook.result.current.addSceneEntity(makeEntity({ id: 'se-1', name: 'Chest' })))

    act(() => hook.result.current.updateEntity('se-1', { name: 'Mimic' }))

    expect(hook.result.current.entities.find((e) => e.id === 'se-1')?.name).toBe('Mimic')
  })

  // ── deleteEntity (auto-detect source) ───────────────────────

  it('deletes a party entity', () => {
    const { hook } = setup()
    act(() => hook.result.current.addPartyEntity(makeEntity({ id: 'pc-1' })))
    expect(hook.result.current.entities).toHaveLength(1)

    act(() => hook.result.current.deleteEntity('pc-1'))

    expect(hook.result.current.entities).toHaveLength(0)
  })

  it('deletes a prepared entity', () => {
    const { hook } = setup()
    act(() => hook.result.current.addPreparedEntity(makeEntity({ id: 'npc-1' })))

    act(() => hook.result.current.deleteEntity('npc-1'))

    expect(hook.result.current.entities).toHaveLength(0)
  })

  it('deletes a scene entity', () => {
    const { hook } = setup()
    act(() => hook.result.current.addSceneEntity(makeEntity({ id: 'se-1' })))

    act(() => hook.result.current.deleteEntity('se-1'))

    expect(hook.result.current.entities).toHaveLength(0)
  })

  // ── promoteToGM ─────────────────────────────────────────────

  it('promotes scene entity to prepared', () => {
    const { hook, world } = setup()
    act(() => hook.result.current.addSceneEntity(makeEntity({ id: 'se-1', name: 'Trap' })))

    act(() => hook.result.current.promoteToGM('se-1'))

    // Should now be in prepared, not in scene entities
    expect(world.prepared.has('se-1')).toBe(true)
    const sceneMap = world.scenes.get(sceneId)
    const sceneEntities = (sceneMap as Y.Map<unknown>).get('entities') as Y.Map<unknown>
    expect(sceneEntities.has('se-1')).toBe(false)
  })

  // ── getEntity ───────────────────────────────────────────────

  it('returns entity by id', () => {
    const { hook } = setup()
    act(() => hook.result.current.addPartyEntity(makeEntity({ id: 'pc-1', name: 'Rogue' })))

    expect(hook.result.current.getEntity('pc-1')?.name).toBe('Rogue')
  })

  it('returns null for unknown id', () => {
    const { hook } = setup()
    expect(hook.result.current.getEntity('nonexistent')).toBeNull()
  })

  it('returns null for null id', () => {
    const { hook } = setup()
    expect(hook.result.current.getEntity(null)).toBeNull()
  })
})
