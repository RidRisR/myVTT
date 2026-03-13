import express from 'express'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import multer from 'multer'
import { ClassicLevel } from 'classic-level'

const require = createRequire(import.meta.url)
const { LeveldbPersistence } = require('y-leveldb')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || './data'

// ── Room ID validation ──
// Structural guard: all :roomId routes inherit this via app.param
function isValidRoomId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id)
}

// Per-room isolated LevelDB instances
const roomYjsDbs = new Map()
const roomAssetDbs = new Map()

function getRoomYjsDb(roomId) {
  if (!isValidRoomId(roomId)) throw new Error(`Invalid room ID: ${roomId}`)
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
  if (!isValidRoomId(roomId)) throw new Error(`Invalid room ID: ${roomId}`)
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

// Allowed MIME types for upload
const ALLOWED_MIME = /^(image|video|audio)\//

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
  return multer({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, ALLOWED_MIME.test(file.mimetype))
    },
  })
}

// Express app
const app = express()

// Validate :roomId param on all routes (structural guard against path traversal)
app.param('roomId', (req, res, next, val) => {
  if (!isValidRoomId(val)) return res.status(400).json({ error: 'Invalid room ID' })
  next()
})

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
  // Validate room ID (not covered by app.param since param name is :id not :roomId)
  if (!isValidRoomId(roomId)) return res.status(400).json({ error: 'Invalid room ID' })
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
    if (existing === undefined) return res.status(404).json({ error: 'Asset not found' })
    const updated = { ...existing, ...req.body, updatedAt: Date.now() }
    await db.put(req.params.assetId, updated)
    res.json({ id: req.params.assetId, ...updated })
  } catch (e) {
    console.error(`[assets] PATCH failed for room ${req.params.roomId}:`, e.message)
    res.status(500).json({ error: 'Failed to update asset' })
  }
})

app.delete('/api/rooms/:roomId/assets/:assetId', async (req, res) => {
  try {
    const db = await getRoomAssetDb(req.params.roomId)
    // Read metadata to find associated file
    const existing = await db.get(req.params.assetId)
    if (existing === undefined) return res.status(404).json({ error: 'Asset not found' })
    // Delete the associated file from disk if it has a URL
    if (existing.url) {
      const match = existing.url.match(/\/uploads\/([^/]+)$/)
      if (match) {
        const filePath = path.join(
          DATA_DIR,
          'rooms',
          req.params.roomId,
          'uploads',
          path.basename(match[1]),
        )
        try {
          fs.unlinkSync(filePath)
        } catch {
          // File may already be gone — log but don't fail
          console.warn(`[assets] File not found on disk for asset ${req.params.assetId}`)
        }
      }
    }
    await db.del(req.params.assetId)
    res.json({ ok: true })
  } catch (e) {
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

// ── GC: remove orphaned non-persistent entities when room empties ──
async function performGC(roomId) {
  try {
    const db = getRoomYjsDb(roomId)
    const ydoc = await db.getYDoc(roomId)
    const entities = ydoc.getMap('entities')
    const scenes = ydoc.getMap('scenes')

    // Collect all entity IDs referenced by any scene
    const referencedIds = new Set()
    scenes.forEach((sceneMap) => {
      const entityIds = sceneMap.get('entityIds')
      if (entityIds) entityIds.forEach((_val, id) => referencedIds.add(id))
    })

    // Find orphaned non-persistent entities
    const orphans = []
    entities.forEach((entityMap, id) => {
      if (!entityMap.get('persistent') && !referencedIds.has(id)) {
        orphans.push(id)
      }
    })

    // Scan for broken encounter token references (read-only phase)
    const encounterFixes = []
    scenes.forEach((sceneMap) => {
      const encounters = sceneMap.get('encounters')
      if (!encounters) return
      encounters.forEach((enc, encId) => {
        const tokens = enc.tokens
        if (!tokens) return
        let changed = false
        const fixedTokens = { ...tokens }
        for (const [tid, t] of Object.entries(fixedTokens)) {
          if (t.entityId && !entities.has(t.entityId)) {
            delete fixedTokens[tid].entityId
            changed = true
          }
        }
        if (changed) {
          encounterFixes.push({ encounters, encId, enc: { ...enc, tokens: fixedTokens } })
        }
      })
    })

    if (orphans.length === 0 && encounterFixes.length === 0) {
      ydoc.destroy()
      return
    }

    // Append-only delta persistence strategy (crash-safe)
    //
    // Why not clearDocument + storeUpdate (compaction):
    // - y-leveldb doesn't expose underlying LevelDB batch API
    // - clearDocument deletes ALL keys by prefix, including just-written updates
    // - Crash between clear and rewrite = permanent data loss
    //
    // Delta approach:
    // - Register update listener first, then transact mutations
    // - Delta updates auto-persist via listener
    // - Worst case on crash: partial writes, next GC retries
    ydoc.on('update', (update) => {
      db.storeUpdate(roomId, update)
    })

    // All mutations inside transact, AFTER update listener is registered
    ydoc.transact(() => {
      orphans.forEach((id) => entities.delete(id))
      encounterFixes.forEach(({ encounters, encId, enc }) => {
        encounters.set(encId, enc)
      })
    })

    console.log(
      `[GC] Room ${roomId}: cleaned ${orphans.length} orphaned entities, ${encounterFixes.length} encounter fixes`,
    )
    ydoc.destroy()
  } catch (e) {
    console.warn(`[GC] Room ${roomId} failed:`, e.message)
  }
}

export {
  app,
  readRooms,
  writeRooms,
  getRoomYjsDb,
  getRoomAssetDb,
  roomConnections,
  performGC,
  isValidRoomId,
  DATA_DIR,
  ROOMS_FILE,
  roomYjsDbs,
  roomAssetDbs,
}
