import { useState, useEffect, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'

export interface DiceFavorite {
  name: string
  formula: string
}

export interface Seat {
  id: string
  name: string
  color: string
  role: 'GM' | 'PL'
  portraitUrl?: string        // player avatar (distinct from character portrait)
  activeCharacterId?: string  // which character is currently focused
}

const SEAT_STORAGE_KEY = 'myvtt-seat-id'
export const SEAT_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

export function useIdentity(yDoc: Y.Doc, awareness: Awareness | null) {
  const [seats, setSeats] = useState<Seat[]>([])
  const [mySeatId, setMySeatId] = useState<string | null>(null)
  const mySeatIdRef = useRef<string | null>(null)

  const yPlayers = yDoc.getMap<Seat>('players')

  // Sync seats from Yjs + auto-claim from sessionStorage
  useEffect(() => {
    const updateSeats = () => {
      const allSeats: Seat[] = []
      yPlayers.forEach((seat) => allSeats.push(seat))
      setSeats(allSeats)

      // Auto-claim when data arrives (handles WS sync delay)
      if (!mySeatIdRef.current) {
        const cached = sessionStorage.getItem(SEAT_STORAGE_KEY)
        if (cached && yPlayers.has(cached)) {
          setMySeatId(cached)
          mySeatIdRef.current = cached
        }
      }
    }
    updateSeats()
    yPlayers.observe(updateSeats)
    return () => yPlayers.unobserve(updateSeats)
  }, [yPlayers])

  // Track online seats via awareness
  const [onlineSeatIds, setOnlineSeatIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!awareness) return
    const updateOnline = () => {
      const online = new Set<string>()
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        if (state.seat?.seatId) online.add(state.seat.seatId)
      })
      setOnlineSeatIds(online)
    }
    updateOnline()
    awareness.on('change', updateOnline)
    return () => awareness.off('change', updateOnline)
  }, [awareness])

  // Broadcast identity via awareness
  useEffect(() => {
    if (!awareness || !mySeatId) return
    const seat = yPlayers.get(mySeatId)
    if (seat) {
      awareness.setLocalStateField('seat', {
        seatId: seat.id,
        name: seat.name,
        color: seat.color,
      })
    }
  }, [awareness, mySeatId, seats])

  const claimSeat = useCallback((seatId: string) => {
    setMySeatId(seatId)
    mySeatIdRef.current = seatId
    sessionStorage.setItem(SEAT_STORAGE_KEY, seatId)
  }, [])

  const createSeat = useCallback((name: string, role: 'GM' | 'PL', color?: string) => {
    const id = self.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
    const seatColor = color ?? SEAT_COLORS[seats.length % SEAT_COLORS.length]
    const seat: Seat = { id, name, color: seatColor, role }
    yPlayers.set(id, seat)
    claimSeat(id)
    return id
  }, [yPlayers, seats.length, claimSeat])

  const leaveSeat = useCallback(() => {
    setMySeatId(null)
    mySeatIdRef.current = null
    sessionStorage.removeItem(SEAT_STORAGE_KEY)
    if (awareness) {
      awareness.setLocalStateField('seat', null)
    }
  }, [awareness])

  const deleteSeat = useCallback((seatId: string) => {
    yPlayers.delete(seatId)
  }, [yPlayers])

  const updateSeat = useCallback((seatId: string, updates: Partial<Omit<Seat, 'id'>>) => {
    const seat = yPlayers.get(seatId)
    if (!seat) return
    yPlayers.set(seatId, { ...seat, ...updates })
  }, [yPlayers])

  const mySeat = mySeatId ? yPlayers.get(mySeatId) ?? null : null

  return {
    seats,
    mySeat,
    mySeatId,
    onlineSeatIds,
    claimSeat,
    createSeat,
    deleteSeat,
    leaveSeat,
    updateSeat,
  }
}
