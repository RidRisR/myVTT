import express from 'express'
import http from 'http'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import multer from 'multer'
import { ClassicLevel } from 'classic-level'

const require = createRequire(import.meta.url)
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils')
const { LeveldbPersistence } = require('y-leveldb')
const Y = require('yjs')
const { Server: WSServer } = require('ws')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.VITE_SERVER_PORT || process.env.PORT || '4444')
const HOST = process.env.HOST || '0.0.0.0'
const DATA_DIR = process.env.DATA_DIR || './data'

// Per-room isolated LevelDB instances
const roomYjsDbs = new Map()
const roomAssetDbs = new Map()

function getRoomYjsDb(roomId) {
  if (!roomYjsDbs.has(roomId)) {
    const dbPath = path.join(DATA_DIR, 'rooms', roomId, 'db', 'yjs')
    fs.mkdirSync(dbPath, { recursive: true })
    roomYjsDbs.set(roomId, new LeveldbPersistence(dbPath))
  }
  return roomYjsDbs.get(roomId)
}

// Pending promise pattern to prevent concurrent ClassicLevel instances (LEVEL_LOCKED)
const pendingAssetDbs = new Map()

function getRoomAssetDb(roomId) {
  if (roomAssetDbs.has(roomId)) return roomAssetDbs.get(roomId)
  if (pendingAssetDbs.has(roomId)) return pendingAssetDbs.get(roomId)

  const dbPath = path.join(DATA_DIR, 'rooms', roomId, 'db', 'assets')
  fs.mkdirSync(dbPath, { recursive: true })
  const db = new ClassicLevel(dbPath, { valueEncoding: 'json' })
  const ready = db.open().then(() => {
    roomAssetDbs.set(roomId, db)
    pendingAssetDbs.delete(roomId)
    return db
  })
  pendingAssetDbs.set(roomId, ready)
  return ready
}

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

// Express app
const app = express()

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// JSON body parsing
app.use(express.json())

// Room metadata storage
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json')

function readRooms() {
  if (!fs.existsSync(ROOMS_FILE)) return []
  return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf-8'))
}

function writeRooms(rooms) {
  fs.mkdirSync(path.dirname(ROOMS_FILE), { recursive: true })
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2))
}

// Room management API
app.get('/api/rooms', (_req, res) => {
  res.json(readRooms())
})

app.post('/api/rooms', (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const id = crypto.randomUUID().slice(0, 8)
  const rooms = readRooms()
  const room = { id, name, createdAt: Date.now() }
  rooms.push(room)
  writeRooms(rooms)
  console.log(`Room created: ${id} ("${name}")`)
  res.status(201).json(room)
})

// Track per-room WebSocket connections for cleanup
const roomConnections = new Map()

app.delete('/api/rooms/:id', async (req, res) => {
  const roomId = req.params.id
  const rooms = readRooms()
  const idx = rooms.findIndex((r) => r.id === roomId)
  if (idx === -1) return res.status(404).json({ error: 'Room not found' })
  rooms.splice(idx, 1)
  writeRooms(rooms)

  // Close active WebSocket connections first (prevent writes to destroyed LevelDB)
  const conns = roomConnections.get(roomId)
  if (conns) {
    for (const conn of conns) conn.close(4410, 'Room deleted')
    roomConnections.delete(roomId)
  }

  // Close both LevelDB instances
  const yjsDb = roomYjsDbs.get(roomId)
  if (yjsDb) {
    await yjsDb.destroy()
    roomYjsDbs.delete(roomId)
  }
  const assetDb = roomAssetDbs.get(roomId)
  if (assetDb) {
    await assetDb.close()
    roomAssetDbs.delete(roomId)
  }

  // Delete entire room directory
  const roomDir = path.join(DATA_DIR, 'rooms', roomId)
  if (fs.existsSync(roomDir)) fs.rmSync(roomDir, { recursive: true, force: true })

  console.log(`Room deleted: ${roomId}`)
  res.json({ ok: true })
})

// Per-room file upload
function getRoomUploadMiddleware(roomId) {
  const uploadsDir = path.join(DATA_DIR, 'rooms', roomId, 'uploads')
  fs.mkdirSync(uploadsDir, { recursive: true })
  const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.bin'
      cb(null, `${crypto.randomUUID()}${ext}`)
    },
  })
  return multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } })
}

app.post('/api/rooms/:roomId/upload', (req, res, next) => {
  const upload = getRoomUploadMiddleware(req.params.roomId)
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: 'No file found' })
    console.log(
      `Uploaded: ${req.file.filename} (${req.file.size} bytes) to room ${req.params.roomId}`,
    )
    res.json({ url: `/api/rooms/${req.params.roomId}/uploads/${req.file.filename}` })
    next()
  })
})

// Serve uploaded files per room
app.get('/api/rooms/:roomId/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename)
  const filePath = path.resolve(DATA_DIR, 'rooms', req.params.roomId, 'uploads', filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
  res.sendFile(filePath, { maxAge: '1y', immutable: true })
})

// Delete uploaded file per room
app.delete('/api/rooms/:roomId/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename)
  const filePath = path.join(DATA_DIR, 'rooms', req.params.roomId, 'uploads', filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
  fs.unlinkSync(filePath)
  console.log(`Deleted: ${filename} from room ${req.params.roomId}`)
  res.json({ ok: true })
})

// Asset metadata CRUD API (classic-level)
app.get('/api/rooms/:roomId/assets', async (req, res) => {
  try {
    const db = await getRoomAssetDb(req.params.roomId)
    const assets = []
    for await (const [key, value] of db.iterator()) {
      assets.push({ id: key, ...value })
    }
    res.json(assets)
  } catch (e) {
    console.error(`[assets] GET failed for room ${req.params.roomId}:`, e.message)
    res.status(500).json({ error: 'Failed to read assets' })
  }
})

app.post('/api/rooms/:roomId/assets', async (req, res) => {
  try {
    const db = await getRoomAssetDb(req.params.roomId)
    const id = crypto.randomUUID().slice(0, 12)
    const asset = { ...req.body, createdAt: Date.now() }
    await db.put(id, asset)
    res.status(201).json({ id, ...asset })
  } catch (e) {
    console.error(`[assets] POST failed for room ${req.params.roomId}:`, e.message)
    res.status(500).json({ error: 'Failed to create asset' })
  }
})

app.patch('/api/rooms/:roomId/assets/:assetId', async (req, res) => {
  try {
    const db = await getRoomAssetDb(req.params.roomId)
    const existing = await db.get(req.params.assetId)
    const updated = { ...existing, ...req.body, updatedAt: Date.now() }
    await db.put(req.params.assetId, updated)
    res.json({ id: req.params.assetId, ...updated })
  } catch (e) {
    if (e.code === 'LEVEL_NOT_FOUND') return res.status(404).json({ error: 'Asset not found' })
    console.error(`[assets] PATCH failed for room ${req.params.roomId}:`, e.message)
    res.status(500).json({ error: 'Failed to update asset' })
  }
})

app.delete('/api/rooms/:roomId/assets/:assetId', async (req, res) => {
  try {
    const db = await getRoomAssetDb(req.params.roomId)
    await db.del(req.params.assetId)
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'LEVEL_NOT_FOUND') return res.status(404).json({ error: 'Asset not found' })
    console.error(`[assets] DELETE failed for room ${req.params.roomId}:`, e.message)
    res.status(500).json({ error: 'Failed to delete asset' })
  }
})

// Serve built frontend in production
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  // SPA fallback: non-API routes serve index.html
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res.send('y-websocket server running (no dist/ found — run npm run build)')
  })
}

// HTTP server + WebSocket
const server = http.createServer(app)
const wss = new WSServer({ server })

wss.on('connection', (conn, req) => {
  const roomId = req.url?.slice(1)?.split('?')[0]
  if (roomId) {
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
        if (conns.size === 0) roomConnections.delete(roomId)
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
  console.log(`Data directory: ${DATA_DIR}`)
})
