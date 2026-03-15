// server/ws.ts — Socket.io auth middleware
import type { Server as SocketIOServer } from 'socket.io'
import { getGlobalDb, getRoomDb } from './db'

export function setupSocketAuth(io: SocketIOServer, dataDir: string): void {
  io.use((socket, next) => {
    // TODO: [S1] Implement JWT verification after identity system (doc 53)
    // Temporary: read from handshake query
    const roomId = socket.handshake.query.roomId as string

    if (!roomId) {
      next(new Error('roomId required'))
      return
    }

    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(roomId)) {
      next(new Error('Invalid roomId'))
      return
    }

    // Verify room exists in global DB
    const globalDb = getGlobalDb(dataDir)
    const room = globalDb.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId) as
      | { id: string }
      | undefined
    if (!room) {
      next(new Error('Room not found'))
      return
    }

    // Ensure room DB is initialized
    getRoomDb(dataDir, roomId)

    socket.data = {
      roomId,
      seatId: null as string | null,
      role: null as 'GM' | 'PL' | null,
    }
    void socket.join(roomId)
    next()
  })

  // Handle seat auth updates after initial connection
  io.on('connection', (socket) => {
    socket.on('auth:update', ({ seatId }: { seatId: string }) => {
      if (!seatId || !socket.data.roomId) return
      const roomDb = getRoomDb(dataDir, socket.data.roomId)
      const seat = roomDb.prepare('SELECT role FROM seats WHERE id = ?').get(seatId) as
        | { role: string }
        | undefined
      if (seat) {
        socket.data.seatId = seatId
        socket.data.role = seat.role as 'GM' | 'PL'
      }
    })
  })
}
