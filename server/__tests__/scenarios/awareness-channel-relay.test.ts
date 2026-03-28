import { describe, it, expect, vi } from 'vitest'

// Minimal mock for Socket.io types
function createMockSocket(roomId: string, seatId: string | null) {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const toEmissions: Array<{ event: string; data: unknown }> = []
  return {
    data: { roomId, seatId, role: seatId ? 'PL' : null },
    id: `socket-${Math.random().toString(36).slice(2)}`,
    on: (event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler)
    },
    to: (_room: string) => ({
      emit: (event: string, data: unknown) => {
        toEmissions.push({ event, data })
      },
    }),
    emit: vi.fn(),
    _handlers: handlers,
    _toEmissions: toEmissions,
  }
}

describe('awareness channel relay', () => {
  it('relays awareness:ch:broadcast with injected seatId', () => {
    const socket = createMockSocket('room1', 'seat-A')
    const handler = (data: { channel: string; payload: unknown }) => {
      if (!socket.data.seatId) return
      socket.to(socket.data.roomId).emit('awareness:ch:broadcast', {
        ...data,
        seatId: socket.data.seatId,
      })
    }
    handler({ channel: 'dh:spell.targeting', payload: { tokenIds: ['t1'] } })
    expect(socket._toEmissions).toHaveLength(1)
    expect(socket._toEmissions[0]).toEqual({
      event: 'awareness:ch:broadcast',
      data: {
        channel: 'dh:spell.targeting',
        payload: { tokenIds: ['t1'] },
        seatId: 'seat-A',
      },
    })
  })

  it('does not relay when seatId is null', () => {
    const socket = createMockSocket('room1', null)
    const handler = (data: { channel: string; payload: unknown }) => {
      if (!socket.data.seatId) return
      socket.to(socket.data.roomId).emit('awareness:ch:broadcast', {
        ...data,
        seatId: socket.data.seatId,
      })
    }
    handler({ channel: 'test:ch', payload: {} })
    expect(socket._toEmissions).toHaveLength(0)
  })
})
