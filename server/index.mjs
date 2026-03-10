import express from 'express'
import http from 'http'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import multer from 'multer'
import { deepCopyYMap, jsonToYMap } from './ymapUtils.mjs'

const require = createRequire(import.meta.url)
const { setupWSConnection, setPersistence, getYDoc } = require('y-websocket/bin/utils')
const { LeveldbPersistence } = require('y-leveldb')
const Y = require('yjs')
const { Server: WSServer } = require('ws')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.VITE_SERVER_PORT || process.env.PORT || '4444')
const HOST = process.env.HOST || '0.0.0.0'
const PERSISTENCE_DIR = process.env.YPERSISTENCE || './db'
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, 'uploads')

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// Set up LevelDB persistence
const ldb = new LeveldbPersistence(PERSISTENCE_DIR)

const docReadyMap = new Map()

setPersistence({
  provider: ldb,
  bindState: async (docName, ydoc) => {
    let resolveReady
    docReadyMap.set(docName, new Promise(r => { resolveReady = r }))

    const persistedYdoc = await ldb.getYDoc(docName)
    let newUpdates = Y.encodeStateAsUpdate(persistedYdoc)

    // Migration: :public first load inherits from bare roomId
    if (docName.endsWith(':public')) {
      const entities = persistedYdoc.getMap('entities')
      const scenes = persistedYdoc.getMap('scenes')
      if (entities.size === 0 && scenes.size === 0) {
        const bareRoomId = docName.replace(':public', '')
        try {
          const legacyDoc = await ldb.getYDoc(bareRoomId)
          if (legacyDoc.getMap('entities').size > 0 || legacyDoc.getMap('scenes').size > 0) {
            console.log(`[migration] ${docName}: inheriting from ${bareRoomId}`)
            newUpdates = Y.encodeStateAsUpdate(legacyDoc)
          }
        } catch (_) { /* no legacy doc */ }
      }
    }

    Y.applyUpdate(ydoc, newUpdates)

    // Migrate roster → entities (one-time, skip for secret docs)
    if (!docName.endsWith(':secret')) {
      const roster = ydoc.getMap('roster')
      const entities = ydoc.getMap('entities')
      if (roster.size > 0 && entities.size === 0) {
        ydoc.transact(() => {
          roster.forEach((val, key) => entities.set(key, val))
        })
        console.log(`[migration] ${docName}: migrated ${roster.size} entries from roster → entities`)
      }
    }

    ydoc.on('update', (update) => {
      ldb.storeUpdate(docName, update)
    })

    resolveReady()
  },
  writeState: async (_docName, _ydoc) => {},
})

async function getReadyDoc(docName) {
  const doc = getYDoc(docName)
  const ready = docReadyMap.get(docName)
  if (ready) await ready
  return doc
}

// Express app
const app = express()

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// JSON body parsing
app.use(express.json())

// Room metadata storage
const ROOMS_FILE = path.join(PERSISTENCE_DIR, 'rooms.json')

function readRooms() {
  if (!fs.existsSync(ROOMS_FILE)) return []
  return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf-8'))
}

function writeRooms(rooms) {
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2))
}

// One-time migration: add tokens to existing rooms
;(() => {
  const rooms = readRooms()
  let migrated = 0
  for (const room of rooms) {
    if (!room.gmToken) {
      room.gmToken = `gm_${room.id}_${crypto.randomBytes(32).toString('hex')}`
      room.playerToken = `pl_${room.id}_${crypto.randomBytes(32).toString('hex')}`
      migrated++
    }
  }
  if (migrated > 0) {
    writeRooms(rooms)
    console.log(`[migration] Added tokens to ${migrated} existing room(s)`)
  }
})()

// Room management API
app.get('/api/rooms', (_req, res) => {
  res.json(readRooms())
})

app.post('/api/rooms', (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const id = crypto.randomUUID().slice(0, 8)
  const gmToken = `gm_${id}_${crypto.randomBytes(32).toString('hex')}`
  const playerToken = `pl_${id}_${crypto.randomBytes(32).toString('hex')}`
  const rooms = readRooms()
  const room = { id, name, createdAt: Date.now(), gmToken, playerToken }
  rooms.push(room)
  writeRooms(rooms)
  console.log(`Room created: ${id} ("${name}")`)
  res.status(201).json(room)
})

app.delete('/api/rooms/:id', async (req, res) => {
  const roomId = req.params.id
  const rooms = readRooms()
  const idx = rooms.findIndex(r => r.id === roomId)
  if (idx === -1) return res.status(404).json({ error: 'Room not found' })
  rooms.splice(idx, 1)
  writeRooms(rooms)
  for (const suffix of ['', ':public', ':secret']) {
    try {
      await ldb.clearDocument(`${roomId}${suffix}`)
    } catch (e) {
      console.warn(`Could not clear LevelDB for ${roomId}${suffix}:`, e.message)
    }
  }
  console.log(`Room deleted: ${roomId}`)
  res.json({ ok: true })
})

// Static file serving for uploads
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '1y',
  immutable: true,
}))

// Multer storage config
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin'
    cb(null, `${crypto.randomUUID()}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } })

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file found' })
  }
  console.log(`Uploaded: ${req.file.filename} (${req.file.size} bytes)`)
  res.json({ url: `/uploads/${req.file.filename}` })
})

// Delete uploaded file
app.delete('/api/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename)
  const filePath = path.join(UPLOADS_DIR, filename)

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found' })
  }

  fs.unlinkSync(filePath)
  console.log(`Deleted: ${filename}`)
  res.json({ ok: true })
})

// --- GM Authentication Middleware ---

function requireGM(req, res, next) {
  const roomId = req.params.id
  const rooms = readRooms()
  const room = rooms.find(r => r.id === roomId)
  if (!room) return res.status(404).json({ error: 'Room not found' })
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ') || auth.slice(7) !== room.gmToken) {
    return res.status(401).json({ error: 'Invalid GM token' })
  }
  req.room = room
  next()
}

// --- Cleanup helper ---

function cleanupEntityFromPublic(pubDoc, entityId) {
  const Y_local = Y
  pubDoc.transact(() => {
    pubDoc.getMap('entities').delete(entityId)
    pubDoc.getMap('scenes').forEach((sceneMap) => {
      if (!(sceneMap instanceof Y_local.Map)) return
      const eIds = sceneMap.get('entityIds')
      if (eIds instanceof Y_local.Map) eIds.delete(entityId)
      const tokens = sceneMap.get('tokens')
      if (tokens instanceof Y_local.Map) {
        const toDelete = []
        tokens.forEach((t, tid) => {
          if (t && typeof t === 'object' && t.entityId === entityId) toDelete.push(tid)
        })
        toDelete.forEach(tid => tokens.delete(tid))
      }
    })
  })
}

// --- Secret Entity REST API ---

// Reveal: move entity from secret → public
app.post('/api/rooms/:id/entities/reveal', requireGM, async (req, res) => {
  const { entityId } = req.body
  if (!entityId) return res.status(400).json({ error: 'entityId required' })
  const roomId = req.params.id

  try {
    const pubDoc = await getReadyDoc(`${roomId}:public`)
    const secDoc = await getReadyDoc(`${roomId}:secret`)
    const pubEntities = pubDoc.getMap('entities')
    const secEntities = secDoc.getMap('secret_entities')

    // Idempotent: already in public
    if (pubEntities.get(entityId) instanceof Y.Map) {
      if (secEntities.has(entityId)) {
        secDoc.transact(() => { secEntities.delete(entityId) })
      }
      return res.json({ ok: true, note: 'already_revealed' })
    }

    const source = secEntities.get(entityId)
    if (!(source instanceof Y.Map)) {
      return res.status(404).json({ error: 'Entity not found in secret_entities' })
    }

    // Deep-copy to public + fix permissions if 'none'
    pubDoc.transact(() => {
      const target = new Y.Map()
      pubEntities.set(entityId, target)
      deepCopyYMap(source, target)
      const permYMap = target.get('permissions')
      if (permYMap instanceof Y.Map && permYMap.get('default') === 'none') {
        permYMap.set('default', 'observer')
      }
    })

    // Delete from secret
    secDoc.transact(() => { secEntities.delete(entityId) })

    console.log(`[reveal] ${roomId}: entity ${entityId} moved secret→public`)
    res.json({ ok: true })
  } catch (err) {
    console.error(`[reveal] Error:`, err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Hide: move entity from public → secret
app.post('/api/rooms/:id/entities/hide', requireGM, async (req, res) => {
  const { entityId } = req.body
  if (!entityId) return res.status(400).json({ error: 'entityId required' })
  const roomId = req.params.id

  try {
    const pubDoc = await getReadyDoc(`${roomId}:public`)
    const secDoc = await getReadyDoc(`${roomId}:secret`)
    const pubEntities = pubDoc.getMap('entities')
    const secEntities = secDoc.getMap('secret_entities')

    // Idempotent: already in secret
    if (secEntities.get(entityId) instanceof Y.Map) {
      cleanupEntityFromPublic(pubDoc, entityId)
      return res.json({ ok: true, note: 'already_hidden' })
    }

    const source = pubEntities.get(entityId)
    if (!(source instanceof Y.Map)) {
      return res.status(404).json({ error: 'Entity not found in entities' })
    }

    // Deep-copy to secret
    secDoc.transact(() => {
      const target = new Y.Map()
      secEntities.set(entityId, target)
      deepCopyYMap(source, target)
    })

    // Cleanup from public
    cleanupEntityFromPublic(pubDoc, entityId)

    console.log(`[hide] ${roomId}: entity ${entityId} moved public→secret`)
    res.json({ ok: true })
  } catch (err) {
    console.error(`[hide] Error:`, err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Create hidden entity
app.post('/api/rooms/:id/secret-entities', requireGM, async (req, res) => {
  const { entity } = req.body
  if (!entity?.id) return res.status(400).json({ error: 'entity.id required' })

  try {
    const secDoc = await getReadyDoc(`${req.params.id}:secret`)
    const secEntities = secDoc.getMap('secret_entities')

    if (secEntities.get(entity.id) instanceof Y.Map) {
      return res.status(409).json({ error: 'Entity already exists in secret_entities' })
    }

    secDoc.transact(() => {
      const yMap = new Y.Map()
      secEntities.set(entity.id, yMap)
      jsonToYMap(yMap, entity)
    })

    console.log(`[secret-entity] ${req.params.id}: created ${entity.id}`)
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error(`[secret-entity] Create error:`, err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update hidden entity
app.patch('/api/rooms/:id/secret-entities/:entityId', requireGM, async (req, res) => {
  const { updates } = req.body
  if (!updates) return res.status(400).json({ error: 'updates object required' })

  try {
    const secDoc = await getReadyDoc(`${req.params.id}:secret`)
    const entityYMap = secDoc.getMap('secret_entities').get(req.params.entityId)
    if (!(entityYMap instanceof Y.Map)) {
      return res.status(404).json({ error: 'Entity not found in secret_entities' })
    }

    secDoc.transact(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id') continue
        if ((key === 'permissions' || key === 'ruleData') && value && typeof value === 'object') {
          entityYMap.delete(key)
          const nested = new Y.Map()
          entityYMap.set(key, nested)
          jsonToYMap(nested, value)
        } else {
          entityYMap.set(key, value)
        }
      }
    })

    console.log(`[secret-entity] ${req.params.id}: updated ${req.params.entityId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error(`[secret-entity] Update error:`, err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Delete hidden entity
app.delete('/api/rooms/:id/secret-entities/:entityId', requireGM, async (req, res) => {
  try {
    const secDoc = await getReadyDoc(`${req.params.id}:secret`)
    const secEntities = secDoc.getMap('secret_entities')

    if (!secEntities.has(req.params.entityId)) {
      return res.status(404).json({ error: 'Entity not found in secret_entities' })
    }

    secDoc.transact(() => { secEntities.delete(req.params.entityId) })

    console.log(`[secret-entity] ${req.params.id}: deleted ${req.params.entityId}`)
    res.json({ ok: true })
  } catch (err) {
    console.error(`[secret-entity] Delete error:`, err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin page
app.get('/admin', (_req, res) => {
  const files = fs.readdirSync(UPLOADS_DIR).map((name) => {
    const stat = fs.statSync(path.join(UPLOADS_DIR, name))
    return { name, size: stat.size }
  })

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const fileCards = files.map((f) => `
    <div class="card">
      <img src="/uploads/${f.name}" alt="${f.name}" />
      <div class="info">
        <div class="name" title="${f.name}">${f.name.slice(0, 12)}...${f.name.slice(-4)}</div>
        <div class="size">${formatSize(f.size)}</div>
      </div>
      <button onclick="deleteFile('${f.name}')" class="del">Delete</button>
    </div>
  `).join('')

  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Asset Manager</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f5f5f5; padding: 24px; }
  h1 { font-size: 20px; margin-bottom: 16px; color: #333; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 24px; align-items: center; }
  .toolbar input[type=file] { flex: 1; }
  .toolbar button { padding: 8px 20px; background: #2563eb; color: #fff; border: none;
    border-radius: 6px; cursor: pointer; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
  .card { background: #fff; border-radius: 8px; overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
  .card img { width: 100%; height: 140px; object-fit: cover; background: #eee; }
  .info { padding: 8px 12px; }
  .name { font-size: 12px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .size { font-size: 11px; color: #999; margin-top: 2px; }
  .del { width: 100%; padding: 6px; background: none; border: none; border-top: 1px solid #eee;
    color: #dc2626; cursor: pointer; font-size: 12px; }
  .del:hover { background: #fef2f2; }
  .empty { color: #999; text-align: center; padding: 48px; }
  .count { color: #999; font-size: 13px; }
</style>
</head><body>
  <h1>Asset Manager <span class="count">(${files.length} files)</span></h1>
  <div class="toolbar">
    <input type="file" id="fileInput" accept="image/*,video/*" multiple />
    <button onclick="uploadFiles()">Upload</button>
  </div>
  <div class="grid">
    ${fileCards || '<div class="empty">No files uploaded</div>'}
  </div>
  ${files.length === 0 ? '<div class="empty">No files uploaded</div>' : ''}
<script>
async function deleteFile(name) {
  if (!confirm('Delete ' + name + '?')) return
  await fetch('/api/uploads/' + name, { method: 'DELETE' })
  location.reload()
}
async function uploadFiles() {
  const input = document.getElementById('fileInput')
  if (!input.files.length) return
  for (const file of input.files) {
    const fd = new FormData()
    fd.append('file', file)
    await fetch('/api/upload', { method: 'POST', body: fd })
  }
  location.reload()
}
</script>
</body></html>`)
})

// Serve built frontend in production
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  // SPA fallback: non-API, non-upload routes serve index.html
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next()
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
  const url = new URL(req.url, `http://${req.headers.host}`)
  const docPath = url.pathname.slice(1)
  const token = url.searchParams.get('token')
  const [roomId, docType = 'public'] = docPath.split(':')

  const rooms = readRooms()
  const room = rooms.find(r => r.id === roomId)
  if (!room) {
    console.warn(`Rejected connection to unknown room: ${roomId}`)
    conn.close(4404, 'Room not found')
    return
  }

  if (docType !== 'public' && docType !== 'secret') {
    conn.close(4400, 'Invalid document type')
    return
  }

  // Transition period: allow tokenless connections to public
  if (token) {
    const isGM = token === room.gmToken
    const isPlayer = token === room.playerToken
    if (!isGM && !isPlayer) {
      conn.close(4401, 'Invalid token')
      return
    }
    if (docType === 'secret' && !isGM) {
      conn.close(4403, 'Forbidden')
      return
    }
  } else if (docType === 'secret') {
    conn.close(4401, 'Token required')
    return
  }

  setupWSConnection(conn, req, { docName: docPath })
})

// Allow slow uploads (10 min timeout for large video files)
server.requestTimeout = 10 * 60 * 1000
server.timeout = 10 * 60 * 1000

server.listen(PORT, HOST, () => {
  console.log(`y-websocket server running on ws://${HOST}:${PORT}`)
  console.log(`Persistence directory: ${PERSISTENCE_DIR}`)
  console.log(`Uploads directory: ${UPLOADS_DIR}`)
})
