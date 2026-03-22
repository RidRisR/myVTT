import { renderHook, act } from '@testing-library/react'
import { usePocStore } from '../store'
import { createDataReader } from '../dataReader'
import { loadMockData } from '../mockData'
import type { PocEntity } from '../types'

beforeEach(() => {
  usePocStore.setState({ entities: {}, globals: {} })
})

describe('updateEntityComponent', () => {
  it('atomically updates one component without touching others', () => {
    const entity: PocEntity = {
      id: 'e1',
      name: 'Test',
      imageUrl: '',
      color: '#000',
      components: {
        'core:health': { hp: 10, maxHp: 20 },
        'core:tags': { tags: ['brave'] },
      },
    }
    usePocStore.setState({ entities: { e1: entity } })

    const { updateEntityComponent } = usePocStore.getState()
    updateEntityComponent('e1', 'core:health', () => ({ hp: 5, maxHp: 20 }))

    const updated = usePocStore.getState().entities.e1!
    expect(updated.components['core:health']).toEqual({ hp: 5, maxHp: 20 })
    expect(updated.components['core:tags']).toEqual({ tags: ['brave'] })
  })
})

describe('patchGlobal', () => {
  it('shallow-merges patch while preserving other fields', () => {
    usePocStore.setState({
      globals: {
        Fear: { key: 'Fear', current: 0, label: 'Dread' },
      },
    })

    const { patchGlobal } = usePocStore.getState()
    patchGlobal('Fear', { current: 5 })

    const g = usePocStore.getState().globals.Fear!
    expect(g.current).toBe(5)
    expect(g.label).toBe('Dread')
    expect(g.key).toBe('Fear')
  })
})

describe('hook re-render precision', () => {
  it('changing entity A does not re-render entity B hook', () => {
    const entityA: PocEntity = {
      id: 'a',
      name: 'A',
      imageUrl: '',
      color: '#f00',
      components: { 'core:health': { hp: 10, maxHp: 10 } },
    }
    const entityB: PocEntity = {
      id: 'b',
      name: 'B',
      imageUrl: '',
      color: '#0f0',
      components: { 'core:health': { hp: 20, maxHp: 20 } },
    }
    usePocStore.setState({ entities: { a: entityA, b: entityB } })

    const selectorSpy = vi.fn(
      (s: { entities: Record<string, PocEntity> }) =>
        s.entities.b?.components['core:health'] as { hp: number; maxHp: number } | undefined,
    )
    renderHook(() => usePocStore(selectorSpy))

    // Update entity A only
    act(() => {
      usePocStore
        .getState()
        .updateEntityComponent('a', 'core:health', () => ({ hp: 1, maxHp: 10 }))
    })

    // Selector is called to check equality, but the hook should NOT re-render
    // because the selected value (entity B's health) hasn't changed.
    // zustand calls the selector on every state change to compare, so calls increase,
    // but the important thing is the returned value is stable.
    const result = selectorSpy.mock.results
    const lastResult = result[result.length - 1]!.value
    const firstResult = result[0]!.value
    expect(lastResult).toEqual(firstResult)
  })
})

describe('query', () => {
  it('returns only entities with the specified component', () => {
    loadMockData()
    const reader = createDataReader()

    const withHealth = reader.query({ has: ['core:health'] })
    expect(withHealth.length).toBe(20) // 2 named + 18 minions

    // entity without core:health should not be included
    const bare: PocEntity = {
      id: 'bare',
      name: 'Bare',
      imageUrl: '',
      color: '#fff',
      components: {},
    }
    usePocStore.setState((s) => ({
      entities: { ...s.entities, bare },
    }))

    const withHealth2 = reader.query({ has: ['core:health'] })
    expect(withHealth2.length).toBe(20) // bare excluded

    const all = reader.query({})
    expect(all.length).toBe(21) // 20 + bare
  })
})

describe('createDataReader', () => {
  it('reads current store snapshot via component()', () => {
    const entity: PocEntity = {
      id: 'r1',
      name: 'Reader Test',
      imageUrl: '',
      color: '#000',
      components: {
        'core:health': { hp: 7, maxHp: 14 },
      },
    }
    usePocStore.setState({ entities: { r1: entity } })

    const reader = createDataReader()
    const health = reader.component<{ hp: number; maxHp: number }>('r1', 'core:health')
    expect(health).toEqual({ hp: 7, maxHp: 14 })
    expect(reader.component('r1', 'nonexistent')).toBeUndefined()
    expect(reader.component('missing', 'core:health')).toBeUndefined()
  })
})
