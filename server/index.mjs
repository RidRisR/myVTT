import http from 'http'
import { createRequire } from 'module'
import {
  app,
  readRooms,
  getRoomYjsDb,
  roomConnections,
  performGC,
  isValidRoomId,
} from './app.mjs'

const require = createRequire(import.meta.url)
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils')
const Y = require('yjs')
const { Server: WSServer } = require('ws')

const PORT = parseInt(process.env.VITE_SERVER_PORT || process.env.PORT || '4444')
const HOST = process.env.HOST || '0.0.0.0'

// Y-websocket persistence: per-room yjs LevelDB
setPersistence({
  bindState: async (docName, ydoc) => {
    const db = getRoomYjsDb(docName)
    const persistedYdoc = await db.getYDoc(docName)
    const newUpdates = Y.encodeStateAsUpdate(persistedYdoc)
    Y.applyUpdate(ydoc, newUpdates)
    ydoc.on('update', (update) => {
      db.storeUpdate(docName, update)
    })
  },
  writeState: async () => {},
})

// HTTP server + WebSocket
const server = http.createServer(app)
const wss = new WSServer({ server })

wss.on('connection', (conn, req) => {
  const roomId = req.url?.slice(1)?.split('?')[0]
  if (roomId) {
    if (!isValidRoomId(roomId)) {
      conn.close(4400, 'Invalid room ID')
      return
    }
    const rooms = readRooms()
    if (!rooms.some((r) => r.id === roomId)) {
      console.warn(`Rejected connection to unknown room: ${roomId}`)
      conn.close(4404, 'Room not found')
      return
    }
    // Track connection for cleanup on room deletion
    if (!roomConnections.has(roomId)) roomConnections.set(roomId, new Set())
    roomConnections.get(roomId).add(conn)
    conn.on('close', () => {
      const conns = roomConnections.get(roomId)
      if (conns) {
        conns.delete(conn)
        if (conns.size === 0) {
          roomConnections.delete(roomId)
          // Delayed GC: clean orphaned entities when room empties
          setTimeout(async () => {
            if (!roomConnections.has(roomId) || roomConnections.get(roomId).size === 0) {
              await performGC(roomId)
            }
          }, 5000)
        }
      }
    })
  }
  setupWSConnection(conn, req)
})

// Allow slow uploads (10 min timeout for large video files)
server.requestTimeout = 10 * 60 * 1000
server.timeout = 10 * 60 * 1000

server.listen(PORT, HOST, () => {
  console.log(`y-websocket server running on ws://${HOST}:${PORT}`)
})
