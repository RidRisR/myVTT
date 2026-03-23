import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { createEventBus, defineEvent, useEvent } from '../eventBus'

describe('EventBus', () => {
  it('emit/on basic flow', () => {
    const bus = createEventBus()
    const handle = defineEvent<{ value: number }>('test')
    const received: number[] = []
    bus.on(handle, (p) => received.push(p.value))
    bus.emit(handle, { value: 42 })
    bus.emit(handle, { value: 99 })
    expect(received).toEqual([42, 99])
  })

  it('exception isolation: handler A throws, handler B still executes', () => {
    const bus = createEventBus()
    const handle = defineEvent<string>('test')
    const results: string[] = []

    bus.on(handle, () => {
      throw new Error('handler A crash')
    })
    bus.on(handle, (p) => results.push(p))

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    bus.emit(handle, 'hello')
    spy.mockRestore()

    expect(results).toEqual(['hello'])
  })

  it('useEvent unmount auto-cleanup', () => {
    const bus = createEventBus()
    const handle = defineEvent<number>('test')
    const received: number[] = []

    const { unmount } = renderHook(() => {
      useEvent(handle, (p) => received.push(p), bus)
    })

    act(() => {
      bus.emit(handle, 1)
    })
    expect(received).toEqual([1])

    unmount()
    act(() => {
      bus.emit(handle, 2)
    })
    expect(received).toEqual([1]) // no new entry after unmount
  })

  it('createEventBus test isolation', () => {
    const bus1 = createEventBus()
    const bus2 = createEventBus()
    const handle = defineEvent<string>('test')
    const results1: string[] = []
    const results2: string[] = []

    bus1.on(handle, (p) => results1.push(p))
    bus2.on(handle, (p) => results2.push(p))

    bus1.emit(handle, 'a')
    expect(results1).toEqual(['a'])
    expect(results2).toEqual([]) // bus2 not affected
  })

  it('useEvent calls latest handler after re-render (ref stability)', () => {
    const bus = createEventBus()
    const handle = defineEvent<number>('test')
    const calls: string[] = []

    const { rerender } = renderHook(
      ({ label }: { label: string }) => {
        useEvent(handle, (p) => calls.push(`${label}:${p}`), bus)
      },
      { initialProps: { label: 'v1' } },
    )

    act(() => { bus.emit(handle, 1) })
    expect(calls).toEqual(['v1:1'])

    // Re-render with a new handler closure
    rerender({ label: 'v2' })

    act(() => { bus.emit(handle, 2) })
    expect(calls).toEqual(['v1:1', 'v2:2']) // latest handler called
  })

  it('on() returns unsubscribe function', () => {
    const bus = createEventBus()
    const handle = defineEvent<number>('test')
    const received: number[] = []

    const unsub = bus.on(handle, (p) => received.push(p))
    bus.emit(handle, 1)
    unsub()
    bus.emit(handle, 2)
    expect(received).toEqual([1])
  })
})
