// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { EventEmitter } from 'events'
import { useTokenAwareness } from '../hooks/useTokenAwareness'
import { useWorldStore } from '../../stores/worldStore'

// ── Mock socket factory ───────────────────────────────────────────────────────

function makeMockSocket() {
  const emitter = new EventEmitter()
  return {
    on: (event: string, cb: (...args: unknown[]) => void) => emitter.on(event, cb),
    off: (event: string, cb: (...args: unknown[]) => void) => emitter.off(event, cb),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      emitter.emit(event, ...args)
      return true
    }),
    // expose emitter for test-driven events
    _emitter: emitter,
  }
}

type MockSocket = ReturnType<typeof makeMockSocket>

// ── Store mocks ───────────────────────────────────────────────────────────────

let mockSocket: MockSocket | null = null

vi.mock('../../stores/worldStore', () => ({
  useWorldStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ _socket: mockSocket }),
  ),
}))

vi.mock('../../stores/identityStore', () => ({
  useIdentityStore: vi.fn(
    (selector: (s: { getMySeat: () => { color: string } | null }) => unknown) =>
      selector({ getMySeat: () => ({ color: '#ff0000' }) }),
  ),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const MY_SEAT_ID = 'seat-me'
const OTHER_SEAT_ID = 'seat-other'

function renderAwareness(seatId = MY_SEAT_ID) {
  return renderHook(() => useTokenAwareness(seatId))
}

/** Assert mockSocket is non-null and return it (guards against test authoring bugs). */
function getSocket(): MockSocket {
  if (!mockSocket) throw new Error('mockSocket is null — did beforeEach run?')
  return mockSocket
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useTokenAwareness', () => {
  beforeEach(() => {
    mockSocket = makeMockSocket()
    vi.mocked(useWorldStore).mockImplementation(((
      selector: (s: Record<string, unknown>) => unknown,
    ) => selector({ _socket: mockSocket })) as typeof useWorldStore)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Initial state ───────────────────────────────────────────────────────────

  it('remoteTokenDrags starts as an empty Map', () => {
    const { result } = renderAwareness()
    expect(result.current.remoteTokenDrags).toBeInstanceOf(Map)
    expect(result.current.remoteTokenDrags.size).toBe(0)
  })

  // ── awareness:tokenDrag ─────────────────────────────────────────────────────

  it('adds an entry to remoteTokenDrags when a different seat emits tokenDrag', () => {
    const { result } = renderAwareness()
    const socket = getSocket()

    act(() => {
      socket._emitter.emit('awareness:tokenDrag', {
        tokenId: 'token-1',
        x: 100,
        y: 200,
        color: '#0000ff',
        seatId: OTHER_SEAT_ID,
      })
    })

    expect(result.current.remoteTokenDrags.size).toBe(1)
    expect(result.current.remoteTokenDrags.get(OTHER_SEAT_ID)).toMatchObject({
      tokenId: 'token-1',
      x: 100,
      y: 200,
      color: '#0000ff',
    })
  })

  // ── seatId filtering ────────────────────────────────────────────────────────

  it('does NOT add an entry when the tokenDrag seatId matches mySeatId', () => {
    const { result } = renderAwareness()
    const socket = getSocket()

    act(() => {
      socket._emitter.emit('awareness:tokenDrag', {
        tokenId: 'token-1',
        x: 100,
        y: 200,
        color: '#ff0000',
        seatId: MY_SEAT_ID,
      })
    })

    expect(result.current.remoteTokenDrags.size).toBe(0)
  })

  // ── awareness:tokenDragEnd ──────────────────────────────────────────────────

  it('removes the entry for a seatId when tokenDragEnd is emitted', () => {
    const { result } = renderAwareness()
    const socket = getSocket()

    // First add an entry
    act(() => {
      socket._emitter.emit('awareness:tokenDrag', {
        tokenId: 'token-1',
        x: 100,
        y: 200,
        color: '#0000ff',
        seatId: OTHER_SEAT_ID,
      })
    })
    expect(result.current.remoteTokenDrags.size).toBe(1)

    // Then end the drag
    act(() => {
      socket._emitter.emit('awareness:tokenDragEnd', { seatId: OTHER_SEAT_ID })
    })
    expect(result.current.remoteTokenDrags.size).toBe(0)
    expect(result.current.remoteTokenDrags.has(OTHER_SEAT_ID)).toBe(false)
  })

  it('tokenDragEnd for mySeatId does not modify remoteTokenDrags', () => {
    const { result } = renderAwareness()
    const socket = getSocket()

    // Add a remote drag
    act(() => {
      socket._emitter.emit('awareness:tokenDrag', {
        tokenId: 'token-1',
        x: 100,
        y: 200,
        color: '#0000ff',
        seatId: OTHER_SEAT_ID,
      })
    })
    expect(result.current.remoteTokenDrags.size).toBe(1)

    // Own dragEnd should be ignored
    act(() => {
      socket._emitter.emit('awareness:tokenDragEnd', { seatId: MY_SEAT_ID })
    })
    expect(result.current.remoteTokenDrags.size).toBe(1)
  })

  // ── awareness:remove ────────────────────────────────────────────────────────

  it('removes the entry for a seatId when awareness:remove is emitted (disconnection)', () => {
    const { result } = renderAwareness()
    const socket = getSocket()

    act(() => {
      socket._emitter.emit('awareness:tokenDrag', {
        tokenId: 'token-2',
        x: 50,
        y: 75,
        color: '#00ff00',
        seatId: OTHER_SEAT_ID,
      })
    })
    expect(result.current.remoteTokenDrags.size).toBe(1)

    act(() => {
      socket._emitter.emit('awareness:remove', { seatId: OTHER_SEAT_ID })
    })
    expect(result.current.remoteTokenDrags.size).toBe(0)
    expect(result.current.remoteTokenDrags.has(OTHER_SEAT_ID)).toBe(false)
  })

  // ── handleTokenDragMove ─────────────────────────────────────────────────────

  it('emits awareness:tokenDrag on the socket with the correct payload', () => {
    const { result } = renderAwareness()
    const socket = getSocket()

    act(() => {
      result.current.handleTokenDragMove('token-abc', 300, 400)
    })

    expect(socket.emit).toHaveBeenCalledWith('awareness:tokenDrag', {
      tokenId: 'token-abc',
      x: 300,
      y: 400,
      color: '#ff0000',
      seatId: MY_SEAT_ID,
    })
  })

  // ── handleTokenDragMove with null socket ────────────────────────────────────

  it('does not crash when socket is null and handleTokenDragMove is called', () => {
    mockSocket = null
    vi.mocked(useWorldStore).mockImplementation(((
      selector: (s: Record<string, unknown>) => unknown,
    ) => selector({ _socket: null })) as typeof useWorldStore)

    const { result } = renderAwareness()

    expect(() => {
      act(() => {
        result.current.handleTokenDragMove('token-xyz', 0, 0)
      })
    }).not.toThrow()
  })

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  it('removes socket listeners on unmount', () => {
    const socket = getSocket()
    const offSpy = vi.spyOn(socket._emitter, 'off')
    const { unmount } = renderAwareness()

    unmount()

    // Expect off to have been called for each of the three events
    const removedEvents = offSpy.mock.calls.map((call) => call[0])
    expect(removedEvents).toContain('awareness:tokenDrag')
    expect(removedEvents).toContain('awareness:tokenDragEnd')
    expect(removedEvents).toContain('awareness:remove')
  })
})
