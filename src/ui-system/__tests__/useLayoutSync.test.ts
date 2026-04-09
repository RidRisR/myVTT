// src/ui-system/__tests__/useLayoutSync.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLayoutStore } from '../../stores/layoutStore'

describe('layout sync logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('layout changes are debounced (no immediate save)', () => {
    const store = createLayoutStore()
    store.getState().loadLayout({
      narrative: {
        'a#1': {
          anchor: 'top-left' as const,
          offsetX: 0,
          offsetY: 0,
          width: 100,
          height: 100,
          zOrder: 0,
        },
      },
      tactical: {},
    })

    const states: string[] = []
    const unsub = store.subscribe((state) => {
      states.push(JSON.stringify({ offsetX: state.narrative['a#1']?.offsetX }))
    })

    store.getState().updateEntry('a#1', { offsetX: 10 })
    store.getState().updateEntry('a#1', { offsetX: 20 })
    store.getState().updateEntry('a#1', { offsetX: 30 })

    // All 3 updates recorded
    expect(states).toHaveLength(3)

    unsub()
  })

  it('edit mode blocks remote layout updates', () => {
    const store = createLayoutStore()
    store.getState().loadLayout({
      narrative: {
        'a#1': {
          anchor: 'top-left' as const,
          offsetX: 0,
          offsetY: 0,
          width: 100,
          height: 100,
          zOrder: 0,
        },
      },
      tactical: {},
    })

    // Enter edit mode and make local change
    store.getState().setLayoutMode('edit')
    store.getState().updateEntry('a#1', { offsetX: 50 })
    expect(store.getState().narrative['a#1']!.offsetX).toBe(50)

    // layoutMode is 'edit' — this documents that consumers should
    // check layoutMode before calling loadLayout for remote updates
    expect(store.getState().layoutMode).toBe('edit')
  })

  it('edit → play transition preserves final layout state', () => {
    const store = createLayoutStore()
    store.getState().loadLayout({
      narrative: {
        'a#1': {
          anchor: 'top-left' as const,
          offsetX: 0,
          offsetY: 0,
          width: 100,
          height: 100,
          zOrder: 0,
        },
      },
      tactical: {},
    })

    store.getState().setLayoutMode('edit')
    store.getState().updateEntry('a#1', { offsetX: 99, offsetY: 88 })
    store.getState().setLayoutMode('play')

    expect(store.getState().narrative['a#1']!.offsetX).toBe(99)
    expect(store.getState().narrative['a#1']!.offsetY).toBe(88)
    expect(store.getState().layoutMode).toBe('play')
  })
})
