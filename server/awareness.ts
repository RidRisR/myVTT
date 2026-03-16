// server/awareness.ts — Ephemeral awareness state relay via Socket.io
import type { TypedServer } from './socketTypes'

/**
 * Sets up awareness relay: clients emit awareness:update, server broadcasts to room.
 * Awareness state is ephemeral — not persisted to DB.
 * Handles: cursor positions, resource drag state, online presence.
 */
export function setupAwareness(io: TypedServer): void {
  io.on('connection', (socket) => {
    const roomId: string = socket.data.roomId
    if (!roomId) {
      console.warn('awareness: socket.data.roomId missing, skipping')
      return
    }

    // Relay awareness updates to other clients in the room
    socket.on('awareness:update', (data) => {
      if (!socket.data.seatId) return
      socket.to(roomId).emit('awareness:update', {
        ...data,
        seatId: socket.data.seatId,
        clientId: socket.id,
      })
    })

    // Relay resource-drag awareness (editing/clear)
    // Server injects seatId to prevent client spoofing
    socket.on('awareness:editing', (data) => {
      if (!socket.data.seatId) return
      socket.to(roomId).emit('awareness:editing', { ...data, seatId: socket.data.seatId })
    })
    socket.on('awareness:clear', () => {
      if (!socket.data.seatId) return
      socket.to(roomId).emit('awareness:clear', { seatId: socket.data.seatId })
    })

    // Relay token drag awareness — server injects seatId
    socket.on('awareness:tokenDrag', (data) => {
      if (!socket.data.seatId) return
      socket.to(roomId).emit('awareness:tokenDrag', { ...data, seatId: socket.data.seatId })
    })
    socket.on('awareness:tokenDragEnd', () => {
      if (!socket.data.seatId) return
      socket.to(roomId).emit('awareness:tokenDragEnd', { seatId: socket.data.seatId })
    })

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
