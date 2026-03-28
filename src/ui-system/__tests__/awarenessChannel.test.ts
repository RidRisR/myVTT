import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAwarenessChannel, AwarenessManager } from '../awarenessChannel'

describe('createAwarenessChannel', () => {
  it('creates a typed channel token with the given key', () => {
    const ch = createAwarenessChannel<{ x: number }>('core:cursor')
    expect(ch.key).toBe('core:cursor')
  })
})

describe('AwarenessManager', () => {
  let manager: AwarenessManager
  const mockEmit = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new AwarenessManager(mockEmit)
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
    mockEmit.mockClear()
  })

  it('broadcast emits via socket', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    manager.broadcast(ch, { x: 42 })
    expect(mockEmit).toHaveBeenCalledWith('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 42 },
    })
  })

  it('clear emits via socket', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    manager.clear(ch)
    expect(mockEmit).toHaveBeenCalledWith('awareness:ch:clear', {
      channel: 'test:pos',
    })
  })

  it('subscribe receives incoming broadcasts', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    manager.subscribe(ch, handler)
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 10 },
      seatId: 'seat-B',
    })
    expect(handler).toHaveBeenCalledWith('seat-B', { x: 10 })
  })

  it('subscribe ignores broadcasts for other channels', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    manager.subscribe(ch, handler)
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'other:ch',
      payload: { x: 10 },
      seatId: 'seat-B',
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('subscribe receives null on clear', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    manager.subscribe(ch, handler)
    manager.handleIncoming('awareness:ch:clear', {
      channel: 'test:pos',
      seatId: 'seat-B',
    })
    expect(handler).toHaveBeenCalledWith('seat-B', null)
  })

  it('unsubscribe stops receiving', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    const unsub = manager.subscribe(ch, handler)
    unsub()
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 10 },
      seatId: 'seat-B',
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('TTL auto-expires stale state', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    manager.subscribe(ch, handler)

    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 10 },
      seatId: 'seat-B',
    })
    expect(handler).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(6000)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenLastCalledWith('seat-B', null)
  })

  it('TTL resets on new broadcast from same seat', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    manager.subscribe(ch, handler)

    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 1 },
      seatId: 'seat-B',
    })

    vi.advanceTimersByTime(3000)

    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 2 },
      seatId: 'seat-B',
    })

    vi.advanceTimersByTime(3000)
    expect(handler).toHaveBeenCalledTimes(2) // two broadcasts, no expiry

    vi.advanceTimersByTime(3000)
    expect(handler).toHaveBeenCalledTimes(3)
    expect(handler).toHaveBeenLastCalledWith('seat-B', null)
  })

  it('handleRemove clears all channels for a seat', () => {
    const ch1 = createAwarenessChannel<{ x: number }>('test:a')
    const ch2 = createAwarenessChannel<{ y: number }>('test:b')
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    manager.subscribe(ch1, handler1)
    manager.subscribe(ch2, handler2)

    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:a',
      payload: { x: 1 },
      seatId: 'seat-B',
    })
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:b',
      payload: { y: 2 },
      seatId: 'seat-B',
    })

    manager.handleRemove('seat-B')
    expect(handler1).toHaveBeenLastCalledWith('seat-B', null)
    expect(handler2).toHaveBeenLastCalledWith('seat-B', null)
  })
})
