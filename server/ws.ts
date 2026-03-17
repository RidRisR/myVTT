// server/ws.ts — Socket.io auth middleware
import type { TypedServer } from './socketTypes'
import { getGlobalDb, getRoomDb, toCamelAll } from './db'

/** Returns online seat colors for a room by querying the room DB. Pure local SQLite, no network. */
export async function getOnlineColors(
  io: TypedServer,
  dataDir: string,
  roomId: string,
): Promise<string[]> {
  const sockets = await io.in(roomId).fetchSockets()
  const seatIds = [
    ...new Set(sockets.map((s) => s.data.seatId).filter((id): id is string => Boolean(id))),
  ]
  if (seatIds.length === 0) return []
  const roomDb = getRoomDb(dataDir, roomId)
  const placeholders = seatIds.map(() => '?').join(',')
  const seats = roomDb
    .prepare(`SELECT color FROM seats WHERE id IN (${placeholders})`)
    .all(...seatIds) as { color: string }[]
  return seats.map((s) => s.color)
}

export function setupSocketAuth(io: TypedServer, dataDir: string): void {
  /** Push updated onlineColors for one room to all admin listeners. */
  const emitPresenceToAdmin = async (roomId: string) => {
    const onlineColors = await getOnlineColors(io, dataDir, roomId)
    io.to('admin').emit('room:presence', { roomId, onlineColors })
  }

  io.use((socket, next) => {
    // TODO: [S1] Implement JWT verification after identity system (doc 53)
    // Temporary: read from handshake query
    const roomId = socket.handshake.query.roomId as string | undefined

    if (!roomId) {
      // Admin connection — no room required
      socket.data = { roomId: '', seatId: null, role: null }
      next()
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
      seatId: null,
      role: null,
    }
    void socket.join(roomId)
    next()
  })

  // Handle seat auth updates after initial connection
  io.on('connection', (socket) => {
    const roomId = socket.data.roomId

    // Admin connection: handle join:admin and skip seat auth setup
    if (!roomId) {
      socket.on('join:admin', () => {
        void (async () => {
          await socket.join('admin')
          const db = getGlobalDb(dataDir)
          const rawRooms = db
            .prepare('SELECT * FROM rooms ORDER BY created_at DESC')
            .all() as Record<string, unknown>[]
          const rooms = toCamelAll(rawRooms)
          const enriched = await Promise.all(
            rooms.map(async (room) => ({
              ...room,
              onlineColors: await getOnlineColors(io, dataDir, room.id),
            })),
          )
          socket.emit('admin:snapshot', enriched)
        })()
      })
      return
    }

    // Send current online seats to the newly connected socket (catch-up)
    void (async () => {
      const sockets = await io.in(roomId).fetchSockets()
      const onlineSeatIds = [
        ...new Set(sockets.map((s) => s.data.seatId).filter((id): id is string => Boolean(id))),
      ]
      for (const seatId of onlineSeatIds) {
        socket.emit('seat:online', { seatId })
      }
    })()

    const emitOfflineIfEmpty = async (seatId: string, rid: string) => {
      const sockets = await io.in(rid).fetchSockets()
      const stillOnline = sockets.some((s) => s.data.seatId === seatId)
      if (!stillOnline) {
        io.in(rid).emit('seat:offline', { seatId })
      }
    }

    const bindSeat = ({ seatId }: { seatId: string }) => {
      if (!seatId || !socket.data.roomId) return
      const prevSeatId = socket.data.seatId
      const rid = socket.data.roomId
      const roomDb = getRoomDb(dataDir, rid)
      const seat = roomDb.prepare('SELECT role FROM seats WHERE id = ?').get(seatId) as
        | { role: string }
        | undefined
      if (seat) {
        socket.data.seatId = seatId
        socket.data.role = seat.role as 'GM' | 'PL'
        // If switching seats, check if old seat still has connections
        if (prevSeatId && prevSeatId !== seatId) {
          void emitOfflineIfEmpty(prevSeatId, rid)
        }
        io.in(rid).emit('seat:online', { seatId })
        void emitPresenceToAdmin(rid)
      }
    }
    socket.on('auth:update', bindSeat)
    socket.on('seat:claim', bindSeat)
    socket.on('seat:leave', () => {
      const prevSeatId = socket.data.seatId
      const rid = socket.data.roomId
      socket.data.seatId = null
      socket.data.role = null
      if (prevSeatId && rid) {
        void emitOfflineIfEmpty(prevSeatId, rid)
        void emitPresenceToAdmin(rid)
      }
    })
    socket.on('disconnect', () => {
      const { seatId, roomId: rid } = socket.data
      if (seatId && rid) {
        void emitOfflineIfEmpty(seatId, rid)
        void emitPresenceToAdmin(rid)
      }
    })
  })
}
