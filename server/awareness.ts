// server/awareness.ts — Ephemeral awareness state relay via Socket.io
import type { Server as SocketIOServer } from 'socket.io'

/**
 * Sets up awareness relay: clients emit awareness:update, server broadcasts to room.
 * Awareness state is ephemeral — not persisted to DB.
 * Handles: cursor positions, resource drag state, online presence.
 */
export function setupAwareness(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    const roomId = socket.data?.roomId
    if (!roomId) {
      console.warn('awareness: socket.data.roomId missing, skipping')
      return
    }

    // Relay awareness updates to other clients in the room
    socket.on(
      'awareness:update',
      (data: { field: string; state: unknown }) => {
        socket.to(roomId).emit('awareness:update', {
          ...data,
          seatId: socket.data.seatId,
          clientId: socket.id,
        })
      },
    )

    // Notify room when a client disconnects
    socket.on('disconnect', () => {
      if (socket.data.seatId) {
        socket.to(roomId).emit('awareness:remove', {
          seatId: socket.data.seatId,
          clientId: socket.id,
        })
      }
    })

    // Notify room of new connection
    if (socket.data.seatId) {
      socket.to(roomId).emit('awareness:update', {
        field: 'presence',
        state: { online: true },
        seatId: socket.data.seatId,
        clientId: socket.id,
      })
    }
  })
}
