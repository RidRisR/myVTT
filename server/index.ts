// server/index.ts — New server entry point: Express + Socket.io + SQLite
// Coexists with index.mjs (old Yjs server). Only one should run at a time.
import http from 'http'
import path from 'path'
import fs from 'fs'
import express from 'express'
import { Server as SocketIOServer } from 'socket.io'
import { fileURLToPath } from 'url'
import { setupSocketAuth } from './ws'
import { setupAwareness } from './awareness'
import { getGlobalDb } from './db'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.VITE_SERVER_PORT || process.env.PORT || '4444')
const HOST = process.env.HOST || '0.0.0.0'
const DATA_DIR = process.env.DATA_DIR || './data'

// ── Express app ──
const app = express()

app.use(express.json())

// CORS (I1: specific origin, not wildcard with credentials)
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', CORS_ORIGIN)
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-MyVTT-Role')
  res.header('Access-Control-Allow-Credentials', 'true')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

// Room ID validation (structural guard)
app.param('roomId', (req, res, next, val) => {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(val)) {
    res.status(400).json({ error: 'Invalid room ID' })
    return
  }
  next()
})

// ── HTTP server + Socket.io ──
const server = http.createServer(app)

const io = new SocketIOServer(server, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true,
  },
})

// Socket.io auth + awareness
setupSocketAuth(io, DATA_DIR)
setupAwareness(io)

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'socketio-sqlite' })
})

// ── Route mounting (Phase 2 will add routes here) ──
// import { roomRoutes } from './routes/rooms'
// import { seatRoutes } from './routes/seats'
// app.use(roomRoutes(DATA_DIR))
// app.use(seatRoutes(DATA_DIR, io))

// Serve built frontend in production
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// Allow slow uploads
server.requestTimeout = 10 * 60 * 1000
server.timeout = 10 * 60 * 1000

// Ensure global DB is initialized
getGlobalDb(DATA_DIR)

server.listen(PORT, HOST, () => {
  console.log(`myVTT server (Socket.io + SQLite) running on http://${HOST}:${PORT}`)
})

export { app, io, DATA_DIR }
