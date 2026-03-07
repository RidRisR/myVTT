import express from 'express'
import http from 'http'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import multer from 'multer'

const require = createRequire(import.meta.url)
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils')
const { LeveldbPersistence } = require('y-leveldb')
const Y = require('yjs')
const { Server: WSServer } = require('ws')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT || '4444')
const HOST = process.env.HOST || '0.0.0.0'
const PERSISTENCE_DIR = process.env.YPERSISTENCE || './db'
const UPLOADS_DIR = path.join(__dirname, 'uploads')

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// Set up LevelDB persistence
const ldb = new LeveldbPersistence(PERSISTENCE_DIR)

setPersistence({
  provider: ldb,
  bindState: async (docName, ydoc) => {
    const persistedYdoc = await ldb.getYDoc(docName)
    const newUpdates = Y.encodeStateAsUpdate(persistedYdoc)
    Y.applyUpdate(ydoc, newUpdates)
    ydoc.on('update', (update) => {
      ldb.storeUpdate(docName, update)
    })
  },
  writeState: async (_docName, _ydoc) => {},
})

// Express app
const app = express()

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
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
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

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
  setupWSConnection(conn, req)
})

server.listen(PORT, HOST, () => {
  console.log(`y-websocket server running on ws://${HOST}:${PORT}`)
  console.log(`Persistence directory: ${PERSISTENCE_DIR}`)
  console.log(`Uploads directory: ${UPLOADS_DIR}`)
})
