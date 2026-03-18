// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { useAwarenessResource, getRemoteEdit } from '../useAwarenessResource'
import { useWorldStore } from '../../stores/worldStore'

// ── Mock socket factory ──

function makeMockSocket() {
  const emitter = new EventEmitter()
  return {
    on: (event: string, cb: (...args: unknown[]) => void) => emitter.on(event, cb),
    off: (event: string, cb: (...args: unknown[]) => void) => emitter.off(event, cb),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      emitter.emit(event, ...args)
      return true
    }),
    _emitter: emitter,
  }
}

type MockSocket = ReturnType<typeof makeMockSocket>

// ── Store mock ──

let mockSocket: MockSocket | null = null

vi.mock('../../stores/worldStore', () => ({
  useWorldStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ _socket: mockSocket }),
  ),
}))

const MY_SEAT = 'seat-me'
const OTHER_SEAT = 'seat-other'

function getSocket(): MockSocket {
  if (!mockSocket) throw new Error('mockSocket is null')
  return mockSocket
}

// ── Tests ──

describe('useAwarenessResource', () => {
  beforeEach(() => {
    mockSocket = makeMockSocket()
    vi.mocked(useWorldStore).mockImplementation(((
      selector: (s: Record<string, unknown>) => unknown,
    ) => selector({ _socket: mockSocket })) as typeof useWorldStore)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('starts with empty remoteEdits Map', () => {
    const { result } = renderHook(() => useAwarenessResource(MY_SEAT, '#ff0000'))
    expect(result.current.remoteEdits).toBeInstanceOf(Map)
    expect(result.current.remoteEdits.size).toBe(0)
  })

  it('tracks remote editing events', () => {
    const { result } = renderHook(() => useAwarenessResource(MY_SEAT, '#ff0000'))
    const socket = getSocket()

    act(() => {
      socket._emitter.emit('awareness:editing', {
        entityId: 'e1',
        field: '0',
        value: 42,
        seatId: OTHER_SEAT,
        color: '#00ff00',
      })
    })

    expect(result.current.remoteEdits.size).toBe(1)
    expect(result.current.remoteEdits.get('e1:0')).toEqual(
      expect.objectContaining({ entityId: 'e1', value: 42, seatId: OTHER_SEAT }),
    )
  })

  it('ignores own seatId broadcasts', () => {
    const { result } = renderHook(() => useAwarenessResource(MY_SEAT, '#ff0000'))
    const socket = getSocket()

    act(() => {
      socket._emitter.emit('awareness:editing', {
        entityId: 'e1',
        field: '0',
        value: 10,
        seatId: MY_SEAT,
        color: '#ff0000',
      })
    })

    expect(result.current.remoteEdits.size).toBe(0)
  })

  it('awareness:clear removes all entries for that seatId', () => {
    const { result } = renderHook(() => useAwarenessResource(MY_SEAT, '#ff0000'))
    const socket = getSocket()

    // Add two entries from OTHER_SEAT
    act(() => {
      socket._emitter.emit('awareness:editing', {
        entityId: 'e1',
        field: '0',
        value: 10,
        seatId: OTHER_SEAT,
        color: '#00ff00',
      })
      socket._emitter.emit('awareness:editing', {
        entityId: 'e1',
        field: '1',
        value: 20,
        seatId: OTHER_SEAT,
        color: '#00ff00',
      })
    })
    expect(result.current.remoteEdits.size).toBe(2)

    // Clear OTHER_SEAT
    act(() => {
      socket._emitter.emit('awareness:clear', { seatId: OTHER_SEAT })
    })

    expect(result.current.remoteEdits.size).toBe(0)
  })

  it('awareness:remove (disconnect) clears entries for that peer', () => {
    const { result } = renderHook(() => useAwarenessResource(MY_SEAT, '#ff0000'))
    const socket = getSocket()

    act(() => {
      socket._emitter.emit('awareness:editing', {
        entityId: 'e1',
        field: '0',
        value: 5,
        seatId: OTHER_SEAT,
        color: '#00ff00',
      })
    })
    expect(result.current.remoteEdits.size).toBe(1)

    // Simulate peer disconnect
    act(() => {
      socket._emitter.emit('awareness:remove', { seatId: OTHER_SEAT })
    })

    expect(result.current.remoteEdits.size).toBe(0)
  })

  it('awareness:clear does not affect other seats', () => {
    const THIRD_SEAT = 'seat-third'
    const { result } = renderHook(() => useAwarenessResource(MY_SEAT, '#ff0000'))
    const socket = getSocket()

    // Add entries from two different seats
    act(() => {
      socket._emitter.emit('awareness:editing', {
        entityId: 'e1',
        field: '0',
        value: 10,
        seatId: OTHER_SEAT,
        color: '#00ff00',
      })
      socket._emitter.emit('awareness:editing', {
        entityId: 'e2',
        field: '0',
        value: 20,
        seatId: THIRD_SEAT,
        color: '#0000ff',
      })
    })
    expect(result.current.remoteEdits.size).toBe(2)

    // Clear only OTHER_SEAT
    act(() => {
      socket._emitter.emit('awareness:clear', { seatId: OTHER_SEAT })
    })

    expect(result.current.remoteEdits.size).toBe(1)
    expect(result.current.remoteEdits.get('e2:0')?.seatId).toBe(THIRD_SEAT)
  })

  it('broadcastEditing emits awareness:editing on socket', () => {
    const { result } = renderHook(() => useAwarenessResource(MY_SEAT, '#ff0000'))
    const socket = getSocket()

    act(() => {
      result.current.broadcastEditing('e1', '0', 55)
    })

    expect(socket.emit).toHaveBeenCalledWith('awareness:editing', {
      entityId: 'e1',
      field: '0',
      value: 55,
      seatId: MY_SEAT,
      color: '#ff0000',
    })
  })

  it('clearEditing emits awareness:clear on socket', () => {
    const { result } = renderHook(() => useAwarenessResource(MY_SEAT, '#ff0000'))
    const socket = getSocket()

    act(() => {
      result.current.clearEditing()
    })

    expect(socket.emit).toHaveBeenCalledWith('awareness:clear', { seatId: MY_SEAT })
  })

  it('does not emit when socket is null', () => {
    mockSocket = null
    vi.mocked(useWorldStore).mockImplementation(((
      selector: (s: Record<string, unknown>) => unknown,
    ) => selector({ _socket: null })) as typeof useWorldStore)

    const { result } = renderHook(() => useAwarenessResource(MY_SEAT, '#ff0000'))

    act(() => {
      result.current.broadcastEditing('e1', '0', 10)
      result.current.clearEditing()
    })
    // Should not throw — just no-op
  })

  it('cleans up listeners on unmount', () => {
    const socket = getSocket()
    const { unmount } = renderHook(() => useAwarenessResource(MY_SEAT, '#ff0000'))

    expect(socket._emitter.listenerCount('awareness:editing')).toBeGreaterThan(0)

    unmount()

    expect(socket._emitter.listenerCount('awareness:editing')).toBe(0)
    expect(socket._emitter.listenerCount('awareness:clear')).toBe(0)
    expect(socket._emitter.listenerCount('awareness:remove')).toBe(0)
  })
})

describe('getRemoteEdit', () => {
  it('returns matching entry', () => {
    const map = new Map([
      [
        'e1:0',
        {
          entityId: 'e1',
          field: '0',
          value: 42,
          seatId: 'seat-1',
          color: '#ff0000',
        },
      ],
    ])
    expect(getRemoteEdit(map, 'e1', '0')).toEqual(
      expect.objectContaining({ entityId: 'e1', value: 42 }),
    )
  })

  it('returns null for missing entry', () => {
    const map = new Map()
    expect(getRemoteEdit(map, 'e1', '0')).toBeNull()
  })
})
