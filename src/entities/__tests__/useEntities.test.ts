import { renderHook, act } from '@testing-library/react'
import * as Y from 'yjs'
import { useEntities } from '../useEntities'
import { createTestDoc } from '../../__test-utils__/yjs-helpers'
import { makeEntity } from '../../__test-utils__/fixtures'

describe('useEntities', () => {
  function setup() {
    const { yDoc, ...world } = createTestDoc()
    const hook = renderHook(() => useEntities(world, yDoc))
    return { yDoc, world, hook }
  }

  // ── init ────────────────────────────────────────────────────

  it('starts with empty entities', () => {
    const { hook } = setup()
    expect(hook.result.current.entities).toEqual([])
  })

  // ── addEntity ───────────────────────────────────────────────

  it('adds an entity', () => {
    const { hook } = setup()
    const entity = makeEntity({ id: 'pc-1', name: 'Fighter' })

    act(() => hook.result.current.addEntity(entity))

    const found = hook.result.current.entities.find((e) => e.id === 'pc-1')
    expect(found).toBeDefined()
    expect(found?.name).toBe('Fighter')
  })

  // ── updateEntity ──────────────────────────────────────────────

  it('updates an entity', () => {
    const { hook } = setup()
    act(() => hook.result.current.addEntity(makeEntity({ id: 'pc-1', name: 'Fighter' })))

    act(() => hook.result.current.updateEntity('pc-1', { name: 'Paladin' }))

    expect(hook.result.current.entities.find((e) => e.id === 'pc-1')?.name).toBe('Paladin')
  })

  // ── deleteEntity ──────────────────────────────────────────────

  it('deletes an entity', () => {
    const { hook } = setup()
    act(() => hook.result.current.addEntity(makeEntity({ id: 'pc-1' })))
    expect(hook.result.current.entities).toHaveLength(1)

    act(() => hook.result.current.deleteEntity('pc-1'))

    expect(hook.result.current.entities).toHaveLength(0)
  })

  // ── getEntity ───────────────────────────────────────────────

  it('returns entity by id', () => {
    const { hook } = setup()
    act(() => hook.result.current.addEntity(makeEntity({ id: 'pc-1', name: 'Rogue' })))

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

  // ── persistent flag ───────────────────────────────────────────

  it('stores and reads back persistent flag', () => {
    const { hook } = setup()
    act(() => hook.result.current.addEntity(makeEntity({ id: 'pc-1', persistent: true })))

    expect(hook.result.current.getEntity('pc-1')?.persistent).toBe(true)
  })

  it('defaults persistent to false', () => {
    const { hook } = setup()
    act(() => hook.result.current.addEntity(makeEntity({ id: 'pc-1' })))

    expect(hook.result.current.getEntity('pc-1')?.persistent).toBe(false)
  })

  // ── nested Y.Map: permissions & ruleData ───────────────────

  it('stores permissions as nested Y.Map', () => {
    const { hook, world } = setup()
    const entity = makeEntity({
      id: 'pc-1',
      permissions: { default: 'observer', seats: { 'seat-1': 'owner' } },
    })

    act(() => hook.result.current.addEntity(entity))

    const yMap = world.entities.get('pc-1') as Y.Map<unknown>
    const permYMap = yMap.get('permissions')
    expect(permYMap).toBeInstanceOf(Y.Map)
    expect((permYMap as Y.Map<unknown>).get('default')).toBe('observer')
    const seatsYMap = (permYMap as Y.Map<unknown>).get('seats')
    expect(seatsYMap).toBeInstanceOf(Y.Map)
    expect((seatsYMap as Y.Map<unknown>).get('seat-1')).toBe('owner')
  })

  it('stores ruleData as nested Y.Map', () => {
    const { hook, world } = setup()
    const entity = makeEntity({
      id: 'pc-1',
      ruleData: { kind: 'pc', level: 3, resources: { hp: { cur: 10, max: 10 } } },
    })

    act(() => hook.result.current.addEntity(entity))

    const yMap = world.entities.get('pc-1') as Y.Map<unknown>
    const ruleYMap = yMap.get('ruleData')
    expect(ruleYMap).toBeInstanceOf(Y.Map)
    expect((ruleYMap as Y.Map<unknown>).get('kind')).toBe('pc')
    expect((ruleYMap as Y.Map<unknown>).get('level')).toBe(3)
    expect((ruleYMap as Y.Map<unknown>).get('resources')).toEqual({ hp: { cur: 10, max: 10 } })
  })

  it('reads back permissions correctly from nested Y.Map', () => {
    const { hook } = setup()
    const entity = makeEntity({
      id: 'pc-1',
      permissions: { default: 'none', seats: { 'seat-1': 'owner', 'seat-2': 'observer' } },
    })

    act(() => hook.result.current.addEntity(entity))

    const found = hook.result.current.getEntity('pc-1')
    expect(found?.permissions).toEqual({
      default: 'none',
      seats: { 'seat-1': 'owner', 'seat-2': 'observer' },
    })
  })

  it('reads back ruleData correctly from nested Y.Map', () => {
    const { hook } = setup()
    const entity = makeEntity({
      id: 'pc-1',
      ruleData: { kind: 'pc', level: 3 },
    })

    act(() => hook.result.current.addEntity(entity))

    const found = hook.result.current.getEntity('pc-1')
    expect(found?.ruleData).toEqual({ kind: 'pc', level: 3 })
  })

  it('null ruleData reads back as null', () => {
    const { hook } = setup()
    act(() => hook.result.current.addEntity(makeEntity({ id: 'pc-1', ruleData: null })))

    expect(hook.result.current.getEntity('pc-1')?.ruleData).toBeNull()
  })

  it('updates permissions via updateEntity', () => {
    const { hook } = setup()
    act(() =>
      hook.result.current.addEntity(
        makeEntity({
          id: 'pc-1',
          permissions: { default: 'observer', seats: { 'seat-1': 'owner' } },
        }),
      ),
    )

    act(() =>
      hook.result.current.updateEntity('pc-1', {
        permissions: { default: 'none', seats: { 'seat-2': 'owner' } },
      }),
    )

    const found = hook.result.current.getEntity('pc-1')
    expect(found?.permissions).toEqual({
      default: 'none',
      seats: { 'seat-2': 'owner' },
    })
  })

  it('updates ruleData via updateEntity (merges top-level keys)', () => {
    const { hook } = setup()
    act(() =>
      hook.result.current.addEntity(
        makeEntity({
          id: 'pc-1',
          ruleData: { kind: 'pc', level: 3, resources: { hp: { cur: 10, max: 10 } } },
        }),
      ),
    )

    // Update only resources, kind and level should be preserved
    act(() =>
      hook.result.current.updateEntity('pc-1', {
        ruleData: { resources: { hp: { cur: 5, max: 10 } } },
      }),
    )

    const found = hook.result.current.getEntity('pc-1')
    const ruleData = found?.ruleData as Record<string, unknown>
    expect(ruleData.kind).toBe('pc')
    expect(ruleData.level).toBe(3)
    expect(ruleData.resources).toEqual({ hp: { cur: 5, max: 10 } })
  })

  // ── fallback branches ──────────────────────────────────────

  it('readPermissions returns default when permissions is not a Y.Map', () => {
    const { hook, world, yDoc } = setup()
    // Manually create entity with permissions as a plain string (not Y.Map)
    act(() => {
      yDoc.transact(() => {
        const yMap = new Y.Map<unknown>()
        world.entities.set('bad-1', yMap)
        yMap.set('id', 'bad-1')
        yMap.set('name', 'Broken')
        yMap.set('imageUrl', '')
        yMap.set('color', '')
        yMap.set('size', 1)
        yMap.set('notes', '')
        yMap.set('persistent', false)
        yMap.set('ruleData', new Y.Map())
        yMap.set('permissions', 'not-a-ymap') // plain value, not Y.Map
      })
    })

    const found = hook.result.current.entities.find((e) => e.id === 'bad-1')
    expect(found?.permissions).toEqual({ default: 'observer', seats: {} })
  })

  it('readRuleData returns null when ruleData is not a Y.Map', () => {
    const { hook, world, yDoc } = setup()
    act(() => {
      yDoc.transact(() => {
        const yMap = new Y.Map<unknown>()
        world.entities.set('bad-2', yMap)
        yMap.set('id', 'bad-2')
        yMap.set('name', 'Broken')
        yMap.set('imageUrl', '')
        yMap.set('color', '')
        yMap.set('size', 1)
        yMap.set('notes', '')
        yMap.set('persistent', false)
        yMap.set('ruleData', 'not-a-ymap')
        const permYMap = new Y.Map<unknown>()
        yMap.set('permissions', permYMap)
        permYMap.set('default', 'observer')
        permYMap.set('seats', new Y.Map())
      })
    })

    const found = hook.result.current.entities.find((e) => e.id === 'bad-2')
    expect(found?.ruleData).toBeNull()
  })

  it('updatePermissions falls back to writePermissions when permissions is not Y.Map', () => {
    const { hook, world, yDoc } = setup()
    // Create entity with permissions as plain value
    act(() => {
      yDoc.transact(() => {
        const yMap = new Y.Map<unknown>()
        world.entities.set('bad-3', yMap)
        yMap.set('id', 'bad-3')
        yMap.set('name', 'Broken')
        yMap.set('imageUrl', '')
        yMap.set('color', '')
        yMap.set('size', 1)
        yMap.set('notes', '')
        yMap.set('persistent', false)
        yMap.set('ruleData', new Y.Map())
        yMap.set('permissions', 'not-a-ymap')
      })
    })

    // updateEntity should fix it via fallback writePermissions
    act(() =>
      hook.result.current.updateEntity('bad-3', {
        permissions: { default: 'none', seats: { 'seat-1': 'owner' } },
      }),
    )

    const found = hook.result.current.getEntity('bad-3')
    expect(found?.permissions).toEqual({ default: 'none', seats: { 'seat-1': 'owner' } })
  })

  it('updateRuleData falls back to writeRuleData when ruleData is not Y.Map', () => {
    const { hook, world, yDoc } = setup()
    act(() => {
      yDoc.transact(() => {
        const yMap = new Y.Map<unknown>()
        world.entities.set('bad-4', yMap)
        yMap.set('id', 'bad-4')
        yMap.set('name', 'Broken')
        yMap.set('imageUrl', '')
        yMap.set('color', '')
        yMap.set('size', 1)
        yMap.set('notes', '')
        yMap.set('persistent', false)
        yMap.set('ruleData', 'not-a-ymap')
        const permYMap = new Y.Map<unknown>()
        yMap.set('permissions', permYMap)
        permYMap.set('default', 'observer')
        permYMap.set('seats', new Y.Map())
      })
    })

    act(() =>
      hook.result.current.updateEntity('bad-4', {
        ruleData: { kind: 'npc', level: 1 },
      }),
    )

    const found = hook.result.current.getEntity('bad-4')
    expect(found?.ruleData).toEqual({ kind: 'npc', level: 1 })
  })

  it('updateEntity no-ops for nonexistent entity', () => {
    const { hook } = setup()
    // Should not throw
    act(() => hook.result.current.updateEntity('nonexistent', { name: 'Ghost' }))
    expect(hook.result.current.entities).toHaveLength(0)
  })

  it('concurrent permissions updates on different seats merge correctly', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    // Bidirectional sync
    doc1.on('update', (update: Uint8Array) => Y.applyUpdate(doc2, update))
    doc2.on('update', (update: Uint8Array) => Y.applyUpdate(doc1, update))

    const entitiesMap1 = doc1.getMap('entities') as Y.Map<Y.Map<unknown>>
    const entitiesMap2 = doc2.getMap('entities') as Y.Map<Y.Map<unknown>>

    // Client 1 creates entity
    doc1.transact(() => {
      const yMap = new Y.Map<unknown>()
      entitiesMap1.set('pc-1', yMap)
      yMap.set('id', 'pc-1')
      yMap.set('name', 'Fighter')
      const permYMap = new Y.Map<unknown>()
      yMap.set('permissions', permYMap)
      permYMap.set('default', 'observer')
      const seatsYMap = new Y.Map<unknown>()
      permYMap.set('seats', seatsYMap)
    })

    // Client 1 adds seat-1 permission
    const entity1 = entitiesMap1.get('pc-1') as Y.Map<unknown>
    const perm1 = entity1.get('permissions') as Y.Map<unknown>
    const seats1 = perm1.get('seats') as Y.Map<unknown>
    seats1.set('seat-1', 'owner')

    // Client 2 adds seat-2 permission (concurrently)
    const entity2 = entitiesMap2.get('pc-1') as Y.Map<unknown>
    const perm2 = entity2.get('permissions') as Y.Map<unknown>
    const seats2 = perm2.get('seats') as Y.Map<unknown>
    seats2.set('seat-2', 'owner')

    // Both should see both seats
    expect(seats1.get('seat-1')).toBe('owner')
    expect(seats1.get('seat-2')).toBe('owner')
    expect(seats2.get('seat-1')).toBe('owner')
    expect(seats2.get('seat-2')).toBe('owner')
  })
})
