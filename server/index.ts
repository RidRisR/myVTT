// server/index.ts — Server entry point: Express + Socket.io + SQLite
import http from 'http'
import path from 'path'
import fs from 'fs'
import express from 'express'
import { Server as SocketIOServer } from 'socket.io'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import { setupSocketAuth } from './ws'
import { setupAwareness } from './awareness'
import { setupLogHandlers } from './logHandler'
import type { TypedServer } from './socketTypes'
import { getGlobalDb, closeAllDbs } from './db'
import { roomRoutes } from './routes/rooms'
import { seatRoutes } from './routes/seats'
import { sceneRoutes } from './routes/scenes'
import { entityRoutes } from './routes/entities'
import { archiveRoutes } from './routes/archives'
import { tacticalRoutes } from './routes/tactical'
import { assetRoutes } from './routes/assets'
import { blueprintRoutes } from './routes/blueprints'
import { trackerRoutes } from './routes/trackers'
import { showcaseRoutes } from './routes/showcase'
import { stateRoutes } from './routes/state'
import { bundleRoutes } from './routes/bundle'
import { tagRoutes } from './routes/tags'
import { layoutRoutes } from './routes/layout'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.VITE_SERVER_PORT || process.env.PORT || '4444')
const HOST = process.env.HOST || '0.0.0.0'
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')

// ── Express app ──
const app = express()

app.use(express.json())

// CORS (I1: specific origin, not wildcard with credentials)
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', CORS_ORIGIN)
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-MyVTT-Role')
  res.header('Access-Control-Allow-Credentials', 'true')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

// Rate limiting — stricter in production, relaxed in dev/test (e2e generates burst traffic)
app.use(
  '/api/',
  rateLimit({
    windowMs: 60_000,
    max: process.env.NODE_ENV === 'production' ? 300 : 1000,
  }),
)

// Room ID validation (structural guard)
app.param('roomId', (_req, res, next, val: string) => {
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
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
  },
}) as TypedServer

// Socket.io auth + awareness
setupSocketAuth(io, DATA_DIR)
setupAwareness(io)
setupLogHandlers(io, DATA_DIR)

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'socketio-sqlite' })
})

// ── Route mounting ──
app.use(roomRoutes(DATA_DIR, io))
app.use(seatRoutes(DATA_DIR, io))
app.use(sceneRoutes(DATA_DIR, io))
app.use(entityRoutes(DATA_DIR, io))
app.use(archiveRoutes(DATA_DIR, io))
app.use(tacticalRoutes(DATA_DIR, io))
app.use(assetRoutes(DATA_DIR, io))
app.use(blueprintRoutes(DATA_DIR, io))
app.use(trackerRoutes(DATA_DIR, io))
app.use(showcaseRoutes(DATA_DIR, io))
app.use(stateRoutes(DATA_DIR, io))
app.use(bundleRoutes(DATA_DIR, io))
app.use(tagRoutes(DATA_DIR, io))
app.use(layoutRoutes(DATA_DIR, io))

// Serve built frontend in production
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      next()
      return
    }
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

// Graceful shutdown
function shutdown() {
  console.log('Shutting down...')
  void io.close()
  server.close(() => {
    closeAllDbs()
    process.exit(0)
  })
  // Force exit after 5s if graceful shutdown stalls
  setTimeout(() => process.exit(1), 5000)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export { app, io, DATA_DIR }
