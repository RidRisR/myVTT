// server/routes/assets.ts — Asset upload + management
import { Router } from 'express'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'
import { toCamel, toCamelAll, parseJsonFields } from '../db'

export function assetRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function uploadsDir(roomId: string): string {
    const dir = path.join(dataDir, 'rooms', roomId, 'uploads')
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  function toAsset(row: Record<string, unknown>) {
    return parseJsonFields(toCamel<Record<string, unknown>>(row), 'extra', 'tags')
  }

  router.get('/api/rooms/:roomId/assets', room, (req, res) => {
    let query = 'SELECT * FROM assets WHERE 1=1'
    const params: unknown[] = []
    if (req.query.type) {
      query += ' AND type = ?'
      params.push(req.query.type)
    }
    query += ' ORDER BY created_at DESC'
    const rows = req.roomDb!.prepare(query).all(...params) as Record<string, unknown>[]
    res.json(rows.map(toAsset))
  })

  router.post('/api/rooms/:roomId/assets', room, (req, res) => {
    const dir = uploadsDir(req.roomId!)
    const storage = multer.diskStorage({
      destination: dir,
      filename: (_r, file, cb) =>
        cb(
          null,
          `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || '.bin'}`,
        ),
    })
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/webm',
      'application/pdf',
    ]
    const upload = multer({
      storage,
      limits: { fileSize: 200 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new Error(`File type ${file.mimetype} not allowed`))
        }
      },
    })

    upload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message })
        return
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' })
        return
      }

      const id = crypto.randomUUID()
      const url = `/api/rooms/${req.roomId}/uploads/${req.file.filename}`
      const assetType = (req.body.type as string) || 'image'
      const name = req.body.name || req.file.originalname
      const extra = req.body.extra ? JSON.parse(req.body.extra) : {}

      try {
        req.roomDb!
          .prepare(
            'INSERT INTO assets (id, url, name, type, created_at, extra) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(id, url, name, assetType, Date.now(), JSON.stringify(extra))
      } catch {
        // Atomic cleanup: DB insert failed → remove orphaned file
        const filePath = path.join(dir, req.file.filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        res.status(500).json({ error: 'Failed to save asset metadata' })
        return
      }

      const asset = toAsset(
        req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<
          string,
          unknown
        >,
      )
      io.to(req.roomId!).emit('asset:created', asset)
      res.status(201).json(asset)
    })
  })

  router.delete('/api/rooms/:roomId/assets/:id', room, (req, res) => {
    const row = req.roomDb!
      .prepare('SELECT * FROM assets WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined
    if (!row) {
      res.status(404).json({ error: 'Asset not found' })
      return
    }

    // Delete file from disk
    const filename = path.basename(row.url as string)
    const filePath = path.join(uploadsDir(req.roomId!), filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    req.roomDb!.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('asset:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  // Static file serving for room uploads
  router.get('/api/rooms/:roomId/uploads/:filename', (req, res) => {
    const roomId = req.params.roomId
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(roomId)) {
      res.status(400).json({ error: 'Invalid room ID' })
      return
    }
    const filename = path.basename(req.params.filename)
    const filePath = path.join(dataDir, 'rooms', roomId, 'uploads', filename)
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.sendFile(filePath, { dotfiles: 'allow' })
  })

  return router
}
