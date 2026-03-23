// src/data/__tests__/dataReader.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDataReader } from '../dataReader'
import { useWorldStore } from '../../stores/worldStore'
import type { Entity } from '../../shared/entityTypes'

function makeEntity(id: string, ruleData: unknown = {}): Entity {
  return {
    id,
    name: `Entity ${id}`,
    imageUrl: '',
    color: '',
    width: 1,
    height: 1,
    blueprintId: undefined,
    notes: '',
    ruleData,
    permissions: { default: 'none' as const, seats: {} },
    lifecycle: 'persistent' as const,
  }
}

describe('createDataReader', () => {
  beforeEach(() => {
    // Reset store entities
    useWorldStore.setState({ entities: {} })
  })

  it('entity() returns entity by ID from worldStore', () => {
    const e = makeEntity('e1')
    useWorldStore.setState({ entities: { e1: e } })

    const reader = createDataReader()
    expect(reader.entity('e1')).toBe(e)
    expect(reader.entity('nonexistent')).toBeUndefined()
  })

  it('component() returns ruleData value by key', () => {
    const e = makeEntity('e1', { hp: { current: 10, max: 20 } })
    useWorldStore.setState({ entities: { e1: e } })

    const reader = createDataReader()
    expect(reader.component<{ current: number; max: number }>('e1', 'hp')).toEqual({
      current: 10,
      max: 20,
    })
    expect(reader.component('e1', 'nonexistent')).toBeUndefined()
    expect(reader.component('missing', 'hp')).toBeUndefined()
  })

  it('query() returns all entities when spec is empty', () => {
    const e1 = makeEntity('e1')
    const e2 = makeEntity('e2')
    useWorldStore.setState({ entities: { e1, e2 } })

    const reader = createDataReader()
    expect(reader.query({})).toHaveLength(2)
    expect(reader.query({ has: [] })).toHaveLength(2)
  })

  it('query() filters by component key presence', () => {
    const e1 = makeEntity('e1', { hp: { current: 10 }, armor: 5 })
    const e2 = makeEntity('e2', { hp: { current: 5 } })
    const e3 = makeEntity('e3', {})
    useWorldStore.setState({ entities: { e1, e2, e3 } })

    const reader = createDataReader()
    const withHp = reader.query({ has: ['hp'] })
    expect(withHp).toHaveLength(2)
    expect(withHp.map((e) => e.id).sort()).toEqual(['e1', 'e2'])

    const withBoth = reader.query({ has: ['hp', 'armor'] })
    expect(withBoth).toHaveLength(1)
    expect(withBoth[0]?.id).toBe('e1')
  })

  it('reads live store state (not stale snapshot)', () => {
    const reader = createDataReader()
    expect(reader.entity('e1')).toBeUndefined()

    // Add entity after reader creation
    useWorldStore.setState({ entities: { e1: makeEntity('e1') } })
    expect(reader.entity('e1')).toBeDefined()
  })
})
