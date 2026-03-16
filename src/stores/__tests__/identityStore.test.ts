import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'events'
import { useIdentityStore, SEAT_COLORS } from '../identityStore'
import type { Seat } from '../identityStore'

// ── Mock sessionStorage ──

const storage: Record<string, string> = {}
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, val: string) => {
    storage[key] = val
  },
  removeItem: (key: string) => {
    Reflect.deleteProperty(storage, key)
  },
})

// ── Mock fetch globally (api.ts uses fetch internally) ──

const mockResponses: Record<string, unknown> = {}

vi.stubGlobal(
  'fetch',
  vi.fn((url: string, _options?: RequestInit) => {
    const path = new URL(url).pathname
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '1' }),
      json: () => Promise.resolve(mockResponses[path] ?? {}),
    })
  }),
)

// ── Mock socket (EventEmitter-based) ──

function createMockSocket() {
  const emitter = new EventEmitter()
  const onSpy = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    emitter.on(event, handler)
  })
  const offSpy = vi.fn((event: string) => {
    emitter.removeAllListeners(event)
  })
  const emitSpy = vi.fn((_event: string, ..._args: unknown[]) => {
    // Don't propagate emits to the EventEmitter — these go to server
  })
  return {
    on: onSpy,
    off: offSpy,
    emit: emitSpy,
    _trigger: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
    _onSpy: onSpy,
    _offSpy: offSpy,
    _emitSpy: emitSpy,
  }
}

// ── Test fixtures ──

const ROOM_ID = 'test-room'

const makeSeat = (overrides: Partial<Seat> = {}): Seat => ({
  id: 'seat-1',
  name: 'Player One',
  color: '#3b82f6',
  role: 'PL',
  ...overrides,
})

// ── Reset store between tests ──

beforeEach(() => {
  useIdentityStore.setState({
    seats: [],
    mySeatId: null,
    onlineSeatIds: new Set(),
    _socket: null,
    _roomId: null,
  })
  vi.mocked(fetch).mockClear()
  Object.keys(mockResponses).forEach((k) => Reflect.deleteProperty(mockResponses, k))
  Object.keys(storage).forEach((k) => Reflect.deleteProperty(storage, k))
})

// ── 1. init() tests ──

describe('init()', () => {
  it('loads seats from API and sets them in store', async () => {
    const seats = [makeSeat(), makeSeat({ id: 'seat-2', name: 'GM', role: 'GM' })]
    mockResponses[`/api/rooms/${ROOM_ID}/seats`] = seats

    const socket = createMockSocket()
    await useIdentityStore.getState().init(ROOM_ID, socket as never)

    const state = useIdentityStore.getState()
    expect(state.seats).toHaveLength(2)
    expect(state.seats[0].name).toBe('Player One')
    expect(state.seats[1].role).toBe('GM')
  })

  it('auto-claims cached seatId from sessionStorage', async () => {
    const seats = [makeSeat({ id: 'seat-cached' })]
    mockResponses[`/api/rooms/${ROOM_ID}/seats`] = seats
    storage['myvtt-seat-id'] = 'seat-cached'

    const socket = createMockSocket()
    await useIdentityStore.getState().init(ROOM_ID, socket as never)

    expect(useIdentityStore.getState().mySeatId).toBe('seat-cached')
    // Should announce presence via socket
    expect(socket._emitSpy).toHaveBeenCalledWith('seat:claim', { seatId: 'seat-cached' })
  })

  it('does not auto-claim if cached seatId is not in seats list', async () => {
    mockResponses[`/api/rooms/${ROOM_ID}/seats`] = [makeSeat({ id: 'seat-1' })]
    storage['myvtt-seat-id'] = 'seat-nonexistent'

    const socket = createMockSocket()
    await useIdentityStore.getState().init(ROOM_ID, socket as never)

    expect(useIdentityStore.getState().mySeatId).toBeNull()
  })

  it('cleanup function removes all WS listeners', async () => {
    mockResponses[`/api/rooms/${ROOM_ID}/seats`] = []
    const socket = createMockSocket()

    const cleanup = await useIdentityStore.getState().init(ROOM_ID, socket as never)
    cleanup()

    const removedEvents = socket._offSpy.mock.calls.map((c) => c[0])
    expect(removedEvents).toContain('seat:created')
    expect(removedEvents).toContain('seat:updated')
    expect(removedEvents).toContain('seat:deleted')
    expect(removedEvents).toContain('seat:online')
    expect(removedEvents).toContain('seat:offline')
  })
})

// ── 2. Socket event handler tests ──

describe('socket event handlers', () => {
  let socket: ReturnType<typeof createMockSocket>

  beforeEach(async () => {
    mockResponses[`/api/rooms/${ROOM_ID}/seats`] = [makeSeat()]
    socket = createMockSocket()
    await useIdentityStore.getState().init(ROOM_ID, socket as never)
  })

  it('seat:created adds to seats array', () => {
    const newSeat = makeSeat({ id: 'seat-2', name: 'New Player' })
    socket._trigger('seat:created', newSeat)

    const seats = useIdentityStore.getState().seats
    expect(seats).toHaveLength(2)
    expect(seats[1].id).toBe('seat-2')
  })

  it('seat:updated updates matching seat', () => {
    socket._trigger('seat:updated', makeSeat({ id: 'seat-1', name: 'Renamed Player' }))

    expect(useIdentityStore.getState().seats[0].name).toBe('Renamed Player')
  })

  it('seat:deleted removes from seats', () => {
    socket._trigger('seat:deleted', { id: 'seat-1' })

    expect(useIdentityStore.getState().seats).toHaveLength(0)
  })

  it('seat:deleted clears mySeatId when my seat is deleted', () => {
    // Claim seat-1 first
    useIdentityStore.getState().claimSeat('seat-1')
    expect(useIdentityStore.getState().mySeatId).toBe('seat-1')

    socket._trigger('seat:deleted', { id: 'seat-1' })

    expect(useIdentityStore.getState().mySeatId).toBeNull()
  })

  it('seat:deleted does not clear mySeatId for other seats', () => {
    // Add a second seat and claim it
    socket._trigger('seat:created', makeSeat({ id: 'seat-2' }))
    useIdentityStore.getState().claimSeat('seat-2')

    socket._trigger('seat:deleted', { id: 'seat-1' })

    expect(useIdentityStore.getState().mySeatId).toBe('seat-2')
  })

  it('seat:online adds seatId to onlineSeatIds', () => {
    socket._trigger('seat:online', { seatId: 'seat-1' })

    expect(useIdentityStore.getState().onlineSeatIds.has('seat-1')).toBe(true)
  })

  it('seat:offline removes seatId from onlineSeatIds', () => {
    socket._trigger('seat:online', { seatId: 'seat-1' })
    socket._trigger('seat:offline', { seatId: 'seat-1' })

    expect(useIdentityStore.getState().onlineSeatIds.has('seat-1')).toBe(false)
  })
})

// ── 3. Action tests ──

describe('action methods', () => {
  let socket: ReturnType<typeof createMockSocket>

  beforeEach(async () => {
    mockResponses[`/api/rooms/${ROOM_ID}/seats`] = [makeSeat()]
    socket = createMockSocket()
    await useIdentityStore.getState().init(ROOM_ID, socket as never)
    vi.mocked(fetch).mockClear()
  })

  function getLastFetchCall() {
    const calls = vi.mocked(fetch).mock.calls
    const lastCall = calls[calls.length - 1]
    const url = lastCall[0]
    const options = lastCall[1]
    return {
      url,
      method: options?.method ?? 'GET',
      body: options?.body ? JSON.parse(options.body as string) : undefined,
    }
  }

  it('createSeat calls POST /api/rooms/{roomId}/seats with correct body', async () => {
    mockResponses[`/api/rooms/${ROOM_ID}/seats`] = makeSeat({ id: 'new-seat' })

    await useIdentityStore.getState().createSeat('GM User', 'GM')

    const { url, method, body } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/seats`)
    expect(method).toBe('POST')
    expect(body.name).toBe('GM User')
    expect(body.role).toBe('GM')
    expect(body.color).toBe(SEAT_COLORS[1]) // 1 existing seat → index 1
  })

  it('createSeat uses provided color when given', async () => {
    mockResponses[`/api/rooms/${ROOM_ID}/seats`] = makeSeat({ id: 'new-seat' })

    await useIdentityStore.getState().createSeat('Player', 'PL', '#custom')

    const { body } = getLastFetchCall()
    expect(body.color).toBe('#custom')
  })

  it('createSeat auto-claims the new seat', async () => {
    mockResponses[`/api/rooms/${ROOM_ID}/seats`] = makeSeat({ id: 'new-seat' })

    await useIdentityStore.getState().createSeat('Player', 'PL')

    expect(useIdentityStore.getState().mySeatId).toBe('new-seat')
  })

  it('claimSeat emits seat:claim on socket and sets mySeatId', () => {
    useIdentityStore.getState().claimSeat('seat-1')

    expect(useIdentityStore.getState().mySeatId).toBe('seat-1')
    expect(socket._emitSpy).toHaveBeenCalledWith('seat:claim', { seatId: 'seat-1' })
  })

  it('claimSeat persists to sessionStorage', () => {
    useIdentityStore.getState().claimSeat('seat-1')

    expect(storage['myvtt-seat-id']).toBe('seat-1')
  })

  it('updateSeat calls PATCH /api/rooms/{roomId}/seats/{id}', async () => {
    await useIdentityStore.getState().updateSeat('seat-1', { name: 'Updated' })

    const { url, method, body } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/seats/seat-1`)
    expect(method).toBe('PATCH')
    expect(body.name).toBe('Updated')
  })

  it('deleteSeat calls DELETE /api/rooms/{roomId}/seats/{id}', async () => {
    await useIdentityStore.getState().deleteSeat('seat-1')

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/seats/seat-1`)
    expect(method).toBe('DELETE')
  })

  it('leaveSeat emits seat:leave and clears mySeatId', () => {
    useIdentityStore.getState().claimSeat('seat-1')
    socket._emitSpy.mockClear()

    useIdentityStore.getState().leaveSeat()

    expect(useIdentityStore.getState().mySeatId).toBeNull()
    expect(socket._emitSpy).toHaveBeenCalledWith('seat:leave', { seatId: 'seat-1' })
    expect(storage['myvtt-seat-id']).toBeUndefined()
  })

  it('getMySeat returns the correct seat', () => {
    useIdentityStore.getState().claimSeat('seat-1')

    const mySeat = useIdentityStore.getState().getMySeat()
    expect(mySeat).not.toBeNull()
    expect(mySeat?.id).toBe('seat-1')
    expect(mySeat?.name).toBe('Player One')
  })

  it('getMySeat returns null when no seat claimed', () => {
    expect(useIdentityStore.getState().getMySeat()).toBeNull()
  })

  it('leaveSeat is safe when no mySeatId is set', () => {
    useIdentityStore.setState({ mySeatId: null })
    // Should not throw
    useIdentityStore.getState().leaveSeat()
    expect(useIdentityStore.getState().mySeatId).toBeNull()
    // Should not emit anything
    expect(socket._emitSpy).not.toHaveBeenCalledWith('seat:leave', expect.anything())
  })

  it('leaveSeat is safe when socket is null', () => {
    useIdentityStore.setState({ _socket: null, mySeatId: 'seat-1' })
    // Should not throw
    useIdentityStore.getState().leaveSeat()
    expect(useIdentityStore.getState().mySeatId).toBeNull()
  })

  it('createSeat returns empty string when roomId is null', async () => {
    useIdentityStore.setState({ _roomId: null })
    const result = await useIdentityStore.getState().createSeat('Test', 'PL')
    expect(result).toBe('')
  })

  it('seat:updated does not affect other seats', () => {
    socket._trigger('seat:created', makeSeat({ id: 'seat-2', name: 'Player Two' }))
    socket._trigger('seat:updated', makeSeat({ id: 'seat-1', name: 'Renamed One' }))

    const seats = useIdentityStore.getState().seats
    expect(seats.find((s) => s.id === 'seat-1')?.name).toBe('Renamed One')
    expect(seats.find((s) => s.id === 'seat-2')?.name).toBe('Player Two')
  })

  it('seat:online is idempotent', () => {
    socket._trigger('seat:online', { seatId: 'seat-1' })
    socket._trigger('seat:online', { seatId: 'seat-1' })

    expect(useIdentityStore.getState().onlineSeatIds.size).toBe(1)
  })
})
