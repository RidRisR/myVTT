// src/ui-system/__tests__/reactiveHooks.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Entity } from '../../shared/entityTypes'
import type { GameLogEntry } from '../../shared/logTypes'
import {
  createReactiveDataSDK,
  createLogHooks,
  createAwarenessHooks,
} from '../reactiveHooks'

// ── Helpers ──

function makeEntity(id: string, components: Record<string, unknown> = {}): Entity {
  return {
    id,
    permissions: { default: 'none', seats: {} },
    lifecycle: 'persistent',
    tags: [],
    components,
  }
}

function makeLogEntry(overrides: Partial<GameLogEntry> & { id: string; type: string }): GameLogEntry {
  return {
    seq: 1,
    origin: { seat: 'seat-1' },
    executor: 'seat-1',
    groupId: 'g1',
    chainDepth: 0,
    triggerable: false,
    visibility: {},
    baseSeq: 0,
    payload: {},
    timestamp: Date.now(),
    ...overrides,
  }
}

// ── createReactiveDataSDK tests ──

describe('createReactiveDataSDK', () => {
  let entities: Record<string, Entity>
  let listeners: Set<() => void>
  let subscribe: (listener: () => void) => () => void

  beforeEach(() => {
    entities = {}
    listeners = new Set()
    subscribe = (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  })

  function notify() {
    for (const l of listeners) l()
  }

  function makeSDK() {
    return createReactiveDataSDK(
      () => entities,
      subscribe,
    )
  }

  describe('useEntity', () => {
    it('returns undefined for non-existent entity', () => {
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useEntity('missing'))
      expect(result.current).toBeUndefined()
    })

    it('returns entity when it exists', () => {
      const hero = makeEntity('hero-1', { 'core:identity': { name: 'Aria' } })
      entities['hero-1'] = hero
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useEntity('hero-1'))
      expect(result.current).toBe(hero)
    })

    it('re-renders when entity changes', () => {
      const hero = makeEntity('hero-1')
      entities['hero-1'] = hero
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useEntity('hero-1'))
      expect(result.current).toBe(hero)

      const updated = makeEntity('hero-1', { 'core:identity': { name: 'Updated' } })
      entities['hero-1'] = updated
      act(() => notify())

      expect(result.current).toBe(updated)
    })

    it('does not re-render when unrelated entity changes', () => {
      const hero = makeEntity('hero-1')
      entities['hero-1'] = hero
      const sdk = makeSDK()
      let renderCount = 0
      renderHook(() => {
        renderCount++
        return sdk.useEntity('hero-1')
      })
      expect(renderCount).toBe(1)

      // Add unrelated entity — hero-1 reference unchanged
      entities['npc-1'] = makeEntity('npc-1')
      act(() => notify())

      // Should not cause extra render since hero-1 is same reference
      expect(renderCount).toBe(1)
    })
  })

  describe('useComponent', () => {
    it('returns undefined when entity does not exist', () => {
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useComponent('missing', 'core:identity'))
      expect(result.current).toBeUndefined()
    })

    it('returns undefined when component key is absent', () => {
      entities['hero-1'] = makeEntity('hero-1')
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useComponent('hero-1', 'core:identity'))
      expect(result.current).toBeUndefined()
    })

    it('returns component data when present', () => {
      const identity = { name: 'Aria' }
      entities['hero-1'] = makeEntity('hero-1', { 'core:identity': identity })
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useComponent('hero-1', 'core:identity'))
      expect(result.current).toBe(identity)
    })

    it('re-renders when component changes', () => {
      entities['hero-1'] = makeEntity('hero-1', { 'core:identity': { name: 'Aria' } })
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useComponent('hero-1', 'core:identity'))

      const newIdentity = { name: 'Kael' }
      entities['hero-1'] = makeEntity('hero-1', { 'core:identity': newIdentity })
      act(() => notify())

      expect(result.current).toBe(newIdentity)
    })
  })

  describe('useQuery', () => {
    it('returns empty array when no entities match', () => {
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useQuery({ has: ['core:tracker'] }))
      expect(result.current).toEqual([])
    })

    it('returns matching entities', () => {
      entities['t1'] = makeEntity('t1', { 'core:tracker': { current: 3 } })
      entities['t2'] = makeEntity('t2', { 'core:tracker': { current: 5 } })
      entities['hero'] = makeEntity('hero', { 'core:identity': { name: 'Aria' } })
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useQuery({ has: ['core:tracker'] }))
      expect(result.current).toHaveLength(2)
      expect(result.current.map((e) => e.id).sort()).toEqual(['t1', 't2'])
    })

    it('returns all entities when spec has no filters', () => {
      entities['a'] = makeEntity('a')
      entities['b'] = makeEntity('b')
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useQuery({}))
      expect(result.current).toHaveLength(2)
    })

    it('returns stable reference when result set is unchanged', () => {
      entities['t1'] = makeEntity('t1', { 'core:tracker': { current: 3 } })
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useQuery({ has: ['core:tracker'] }))
      const first = result.current

      // Unrelated change — tracker entities unchanged
      entities['hero'] = makeEntity('hero', { 'core:identity': {} })
      act(() => notify())

      expect(result.current).toBe(first)
    })

    it('updates when matching entity is added', () => {
      entities['t1'] = makeEntity('t1', { 'core:tracker': { current: 3 } })
      const sdk = makeSDK()
      const { result } = renderHook(() => sdk.useQuery({ has: ['core:tracker'] }))
      expect(result.current).toHaveLength(1)

      entities['t2'] = makeEntity('t2', { 'core:tracker': { current: 5 } })
      act(() => notify())

      expect(result.current).toHaveLength(2)
    })
  })
})

// ── createLogHooks tests ──

describe('createLogHooks', () => {
  let logEntries: GameLogEntry[]
  let listeners: Set<() => void>
  let subscribe: (listener: () => void) => () => void

  beforeEach(() => {
    logEntries = []
    listeners = new Set()
    subscribe = (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  })

  function notify() {
    for (const l of listeners) l()
  }

  function makeHooks() {
    return createLogHooks(() => logEntries, subscribe)
  }

  it('returns empty entries when no logs match', () => {
    const hooks = makeHooks()
    const { result } = renderHook(() => hooks.useEntries('core:roll-result'))
    expect(result.current.entries).toEqual([])
    expect(result.current.newIds.size).toBe(0)
  })

  it('returns matching historical entries on mount', () => {
    logEntries = [
      makeLogEntry({ id: 'a', type: 'core:roll-result', seq: 1 }),
      makeLogEntry({ id: 'b', type: 'core:text', seq: 2 }),
      makeLogEntry({ id: 'c', type: 'core:roll-result', seq: 3 }),
    ]
    const hooks = makeHooks()
    const { result } = renderHook(() => hooks.useEntries('core:roll-result'))
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries.map((e) => e.id)).toEqual(['a', 'c'])
  })

  it('historical entries are not in newIds', () => {
    logEntries = [makeLogEntry({ id: 'a', type: 'core:roll-result', seq: 1 })]
    const hooks = makeHooks()
    const { result } = renderHook(() => hooks.useEntries('core:roll-result'))
    expect(result.current.newIds.has('a')).toBe(false)
  })

  it('entries arriving after mount are in newIds', () => {
    logEntries = [makeLogEntry({ id: 'old', type: 'core:roll-result', seq: 1 })]
    const hooks = makeHooks()
    const { result } = renderHook(() => hooks.useEntries('core:roll-result'))

    // New entry arrives
    const newEntry = makeLogEntry({ id: 'new', type: 'core:roll-result', seq: 2 })
    logEntries = [...logEntries, newEntry]
    act(() => notify())

    expect(result.current.entries.map((e) => e.id)).toEqual(['old', 'new'])
    expect(result.current.newIds.has('old')).toBe(false)
    expect(result.current.newIds.has('new')).toBe(true)
  })

  it('respects limit option', () => {
    logEntries = [
      makeLogEntry({ id: 'a', type: 'core:roll-result', seq: 1 }),
      makeLogEntry({ id: 'b', type: 'core:roll-result', seq: 2 }),
      makeLogEntry({ id: 'c', type: 'core:roll-result', seq: 3 }),
    ]
    const hooks = makeHooks()
    const { result } = renderHook(() => hooks.useEntries('core:roll-result', { limit: 2 }))
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries.map((e) => e.id)).toEqual(['b', 'c'])
  })

  it('limit applies after new entries arrive', () => {
    logEntries = [
      makeLogEntry({ id: 'a', type: 'core:roll-result', seq: 1 }),
      makeLogEntry({ id: 'b', type: 'core:roll-result', seq: 2 }),
    ]
    const hooks = makeHooks()
    const { result } = renderHook(() => hooks.useEntries('core:roll-result', { limit: 2 }))

    logEntries = [
      ...logEntries,
      makeLogEntry({ id: 'c', type: 'core:roll-result', seq: 3 }),
    ]
    act(() => notify())

    expect(result.current.entries.map((e) => e.id)).toEqual(['b', 'c'])
  })
})

// ── createAwarenessHooks tests ──

describe('createAwarenessHooks', () => {
  it('returns empty map initially', () => {
    const subscribeAwareness = vi.fn().mockReturnValue(() => {})
    const hooks = createAwarenessHooks(subscribeAwareness)
    const channel = { key: 'cursor' }
    const { result } = renderHook(() => hooks.usePeers(channel))
    expect(result.current.size).toBe(0)
  })

  it('calls subscribe on mount and unsubscribe on unmount', () => {
    const unsubscribe = vi.fn()
    const subscribeAwareness = vi.fn().mockReturnValue(unsubscribe)
    const hooks = createAwarenessHooks(subscribeAwareness)
    const channel = { key: 'cursor' }
    const { unmount } = renderHook(() => hooks.usePeers(channel))

    expect(subscribeAwareness).toHaveBeenCalledWith(channel, expect.any(Function))
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('updates map when peer state arrives', () => {
    let handler: ((seatId: string, state: unknown) => void) | undefined
    const subscribeAwareness = vi.fn().mockImplementation((_ch, h) => {
      handler = h
      return () => {}
    })
    const hooks = createAwarenessHooks(subscribeAwareness)
    const channel = { key: 'cursor' }
    const { result } = renderHook(() => hooks.usePeers(channel))

    act(() => handler!('seat-1', { x: 100, y: 200 }))
    expect(result.current.get('seat-1')).toEqual({ x: 100, y: 200 })
  })

  it('removes peer when state is null', () => {
    let handler: ((seatId: string, state: unknown) => void) | undefined
    const subscribeAwareness = vi.fn().mockImplementation((_ch, h) => {
      handler = h
      return () => {}
    })
    const hooks = createAwarenessHooks(subscribeAwareness)
    const channel = { key: 'cursor' }
    const { result } = renderHook(() => hooks.usePeers(channel))

    act(() => handler!('seat-1', { x: 100 }))
    expect(result.current.has('seat-1')).toBe(true)

    act(() => handler!('seat-1', null))
    expect(result.current.has('seat-1')).toBe(false)
  })

  it('tracks multiple peers independently', () => {
    let handler: ((seatId: string, state: unknown) => void) | undefined
    const subscribeAwareness = vi.fn().mockImplementation((_ch, h) => {
      handler = h
      return () => {}
    })
    const hooks = createAwarenessHooks(subscribeAwareness)
    const channel = { key: 'cursor' }
    const { result } = renderHook(() => hooks.usePeers(channel))

    act(() => {
      handler!('seat-1', { x: 10 })
      handler!('seat-2', { x: 20 })
    })

    expect(result.current.size).toBe(2)
    expect(result.current.get('seat-1')).toEqual({ x: 10 })
    expect(result.current.get('seat-2')).toEqual({ x: 20 })
  })
})
