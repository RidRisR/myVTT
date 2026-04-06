// src/stores/identityStore.ts
// Identity store: seats, mySeat, online tracking via Socket.io.
// REST API for seat CRUD; Socket.io events for real-time updates.

import { create } from 'zustand'
import type { TypedClientSocket } from '../shared/socketEvents'
import { api } from '../shared/api'

export type { Seat } from '../shared/storeTypes'
import type { Seat } from '../shared/storeTypes'

const SEAT_STORAGE_KEY = 'myvtt-seat-id'

export const SEAT_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
]

const SEAT_WS_EVENTS = [
  'seat:created',
  'seat:updated',
  'seat:deleted',
  'seat:online',
  'seat:offline',
] as const

interface IdentityState {
  seats: Seat[]
  mySeatId: string | null
  onlineSeatIds: Set<string>

  // Internal refs
  _socket: TypedClientSocket | null
  _roomId: string | null

  // Derived getters
  getMySeat: () => Seat | null

  // Init — connects Socket.io listeners + loads seats
  init: (roomId: string, socket: TypedClientSocket) => Promise<() => void>

  // Actions
  claimSeat: (seatId: string) => void
  createSeat: (name: string, role: 'GM' | 'PL', color?: string) => Promise<string>
  leaveSeat: () => void
  deleteSeat: (seatId: string) => Promise<void>
  updateSeat: (seatId: string, updates: Partial<Omit<Seat, 'id'>>) => Promise<void>

  /** @internal Test-only */
  _reset: () => void
}

export const useIdentityStore = create<IdentityState>((set, get) => ({
  seats: [],
  mySeatId: null,
  onlineSeatIds: new Set(),

  _socket: null,
  _roomId: null,

  getMySeat: () => {
    const { mySeatId, seats } = get()
    if (!mySeatId) return null
    return seats.find((s) => s.id === mySeatId) ?? null
  },

  init: async (roomId, socket) => {
    set({ _socket: socket, _roomId: roomId })

    // Register WS event listeners BEFORE the REST call.
    // The server sends seat:online events immediately on connection (initial sync).
    // If we await the REST call first, those events arrive before the listener
    // is registered and are silently dropped.
    socket.on('seat:created', (seat: Seat) => {
      set((s) => ({ seats: [...s.seats, seat] }))
    })
    socket.on('seat:updated', (seat: Seat) => {
      set((s) => ({
        seats: s.seats.map((existing) => (existing.id === seat.id ? seat : existing)),
      }))
    })
    socket.on('seat:deleted', ({ id }: { id: string }) => {
      set((s) => {
        const newState: Partial<IdentityState> = {
          seats: s.seats.filter((seat) => seat.id !== id),
        }
        // If my seat was deleted, unclaim
        if (s.mySeatId === id) {
          newState.mySeatId = null
          sessionStorage.removeItem(SEAT_STORAGE_KEY)
        }
        return newState
      })
    })
    socket.on('seat:online', ({ seatId }: { seatId: string }) => {
      set((s) => {
        const next = new Set(s.onlineSeatIds)
        next.add(seatId)
        return { onlineSeatIds: next }
      })
    })
    socket.on('seat:offline', ({ seatId }: { seatId: string }) => {
      set((s) => {
        const next = new Set(s.onlineSeatIds)
        next.delete(seatId)
        return { onlineSeatIds: next }
      })
    })

    // Load seats from REST (after listeners are registered)
    const seats = await api.get<Seat[]>(`/api/rooms/${roomId}/seats`)
    set({ seats })

    // Auto-claim from sessionStorage
    const cached = sessionStorage.getItem(SEAT_STORAGE_KEY)
    if (cached && seats.some((s) => s.id === cached)) {
      set({ mySeatId: cached })
      // Announce presence
      socket.emit('seat:claim', { seatId: cached })
    }

    // Return cleanup
    return () => {
      SEAT_WS_EVENTS.forEach((e) => socket.off(e))
    }
  },

  claimSeat: (seatId: string) => {
    // Emit seat:claim BEFORE updating store. Zustand subscribers fire
    // synchronously within set(), and startWorkflowTriggers (subscribed in
    // App.tsx) may emit entity:create-request on the same socket. Socket.io
    // delivers messages in order, so emitting seat:claim first guarantees the
    // server has socket.data.seatId set before any plugin entity requests.
    const { _socket: socket } = get()
    if (socket) {
      socket.emit('seat:claim', { seatId })
    }
    set({ mySeatId: seatId })
    sessionStorage.setItem(SEAT_STORAGE_KEY, seatId)
  },

  createSeat: async (name: string, role: 'GM' | 'PL', color?: string) => {
    const { _roomId: roomId, seats, claimSeat } = get()
    if (!roomId) return ''
    const seatColor = color ?? SEAT_COLORS[seats.length % SEAT_COLORS.length]
    const seat = await api.post<Seat>(`/api/rooms/${roomId}/seats`, {
      name,
      role,
      color: seatColor,
    })
    // Optimistically add seat to avoid race between claim and WS event
    set((s) => ({
      seats: s.seats.some((x) => x.id === seat.id) ? s.seats : [...s.seats, seat],
    }))
    claimSeat(seat.id)
    return seat.id
  },

  leaveSeat: () => {
    const { _socket: socket, mySeatId } = get()
    if (socket && mySeatId) {
      socket.emit('seat:leave', { seatId: mySeatId })
    }
    set({ mySeatId: null })
    sessionStorage.removeItem(SEAT_STORAGE_KEY)
  },

  deleteSeat: async (seatId: string) => {
    const { _roomId: roomId } = get()
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/seats/${seatId}`)
    // Store update via WS event
  },

  updateSeat: async (seatId: string, updates: Partial<Omit<Seat, 'id'>>) => {
    const { _roomId: roomId } = get()
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/seats/${seatId}`, updates)
    // Store update via WS event
  },

  /** @internal Test-only: reset store to initial state (preserves socket/roomId) */
  _reset: () => {
    set({
      seats: [],
      mySeatId: null,
      onlineSeatIds: new Set(),
    })
  },
}))
