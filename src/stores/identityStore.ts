// src/stores/identityStore.ts
// Identity store: seats, mySeat, awareness, online tracking.
// Yjs observer on seats map writes into the store.
// Awareness broadcasts are managed here.

import { create } from 'zustand'
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'

export interface Seat {
  id: string
  name: string
  color: string
  role: 'GM' | 'PL'
  portraitUrl?: string
  activeCharacterId?: string
}

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

interface IdentityState {
  seats: Seat[]
  mySeatId: string | null
  onlineSeatIds: Set<string>

  // Yjs refs (set during init)
  _ySeats: Y.Map<Seat> | null
  _awareness: Awareness | null

  // Derived getter
  getMySeat: () => Seat | null

  // Init — connects Yjs observer + awareness listener
  init: (ySeats: Y.Map<unknown>, awareness: Awareness | null) => () => void

  // Actions
  claimSeat: (seatId: string) => void
  createSeat: (name: string, role: 'GM' | 'PL', color?: string) => string
  leaveSeat: () => void
  deleteSeat: (seatId: string) => void
  updateSeat: (seatId: string, updates: Partial<Omit<Seat, 'id'>>) => void
}

export const useIdentityStore = create<IdentityState>((set, get) => ({
  seats: [],
  mySeatId: null,
  onlineSeatIds: new Set(),

  _ySeats: null,
  _awareness: null,

  getMySeat: () => {
    const { mySeatId, _ySeats } = get()
    if (!mySeatId || !_ySeats) return null
    return _ySeats.get(mySeatId) ?? null
  },

  init: (ySeats: Y.Map<unknown>, awareness: Awareness | null) => {
    const yPlayers = ySeats as Y.Map<Seat>
    set({ _ySeats: yPlayers, _awareness: awareness })

    // Seats observer
    const updateSeats = () => {
      const allSeats: Seat[] = []
      yPlayers.forEach((seat) => allSeats.push(seat))
      set({ seats: allSeats })

      // Auto-claim from sessionStorage on initial sync
      const { mySeatId } = get()
      if (!mySeatId) {
        const cached = sessionStorage.getItem(SEAT_STORAGE_KEY)
        if (cached && yPlayers.has(cached)) {
          set({ mySeatId: cached })
        }
      }
    }
    updateSeats()
    yPlayers.observe(updateSeats)

    // Awareness observer for online tracking
    let awarenessCleanup: (() => void) | undefined
    if (awareness) {
      const updateOnline = () => {
        const online = new Set<string>()
        awareness.getStates().forEach((state, clientId) => {
          if (clientId === awareness.clientID) return
          if (state.seat?.seatId) online.add(state.seat.seatId)
        })
        set({ onlineSeatIds: online })
      }
      updateOnline()
      awareness.on('change', updateOnline)
      awarenessCleanup = () => awareness.off('change', updateOnline)
    }

    return () => {
      yPlayers.unobserve(updateSeats)
      awarenessCleanup?.()
    }
  },

  claimSeat: (seatId: string) => {
    set({ mySeatId: seatId })
    sessionStorage.setItem(SEAT_STORAGE_KEY, seatId)

    // Broadcast via awareness
    const { _awareness: awareness, _ySeats: yPlayers } = get()
    if (awareness && yPlayers) {
      const seat = yPlayers.get(seatId)
      if (seat) {
        awareness.setLocalStateField('seat', {
          seatId: seat.id,
          name: seat.name,
          color: seat.color,
        })
      }
    }
  },

  createSeat: (name: string, role: 'GM' | 'PL', color?: string) => {
    const { _ySeats: yPlayers, seats, claimSeat } = get()
    if (!yPlayers) return ''
    const id =
      self.crypto?.randomUUID?.() ??
      Math.random().toString(36).slice(2) + Date.now().toString(36)
    const seatColor = color ?? SEAT_COLORS[seats.length % SEAT_COLORS.length]
    const seat: Seat = { id, name, color: seatColor, role }
    yPlayers.set(id, seat)
    claimSeat(id)
    return id
  },

  leaveSeat: () => {
    set({ mySeatId: null })
    sessionStorage.removeItem(SEAT_STORAGE_KEY)
    const { _awareness: awareness } = get()
    if (awareness) {
      awareness.setLocalStateField('seat', null)
    }
  },

  deleteSeat: (seatId: string) => {
    get()._ySeats?.delete(seatId)
  },

  updateSeat: (seatId: string, updates: Partial<Omit<Seat, 'id'>>) => {
    const yPlayers = get()._ySeats
    if (!yPlayers) return
    const seat = yPlayers.get(seatId)
    if (!seat) return
    yPlayers.set(seatId, { ...seat, ...updates })
  },
}))
