// server/routes/assets.ts — Asset upload + management
import { Router } from 'express'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import type { TypedServer } from '../socketTypes'
import type { AssetRecord } from '../../src/shared/storeTypes'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields, safePath } from '../db'

export function assetRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function uploadsDir(roomId: string): string {
    const dir = safePath(dataDir, 'rooms', roomId, 'uploads')
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  function toAsset(row: Record<string, unknown>): AssetRecord {
    return parseJsonFields(toCamel(row), 'extra', 'tags') as unknown as AssetRecord
  }

  router.get('/api/rooms/:roomId/assets', room, (req, res) => {
    let query = 'SELECT * FROM assets WHERE 1=1'
    const params: unknown[] = []
    if (req.query.mediaType) {
      query += ' AND media_type = ?'
      params.push(req.query.mediaType)
    }
    query += ' ORDER BY sort_order ASC, created_at DESC'
    const rows = req.roomDb!.prepare(query).all(...params) as Record<string, unknown>[]
    res.json(rows.map(toAsset))
  })

  router.post('/api/rooms/:roomId/assets', room, (req, res) => {
    const dir = uploadsDir(req.roomId!)
    const storage = multer.diskStorage({
      destination: dir,
      filename: (_r, file, cb) => {
        cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || '.bin'}`)
      },
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

    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ error: (err as Error).message })
        return
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' })
        return
      }

      const id = crypto.randomUUID()
      const url = `/api/rooms/${req.roomId}/uploads/${req.file.filename}`
      const uploadBody = req.body as Record<string, unknown>
      const mediaType = (uploadBody.mediaType as string) || 'image'
      const name = (uploadBody.name as string) || req.file.originalname
      const extra = uploadBody.extra
        ? (JSON.parse(uploadBody.extra as string) as Record<string, unknown>)
        : {}
      const tags = extra.tags ? JSON.stringify(extra.tags) : '[]'

      try {
        req
          .roomDb!.prepare(
            'INSERT INTO assets (id, url, name, media_type, tags, created_at, extra) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(id, url, name, mediaType, tags, Date.now(), JSON.stringify(extra))
      } catch {
        // Atomic cleanup: DB insert failed → remove orphaned file
        const filePath = safePath(dir, req.file.filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        res.status(500).json({ error: 'Failed to save asset metadata' })
        return
      }

      const asset = toAsset(
        req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>,
      )
      io.to(req.roomId!).emit('asset:created', asset)
      res.status(201).json(asset)
    })
  })

  router.patch('/api/rooms/:roomId/assets/reorder', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const order = body.order
    if (!Array.isArray(order)) {
      res.status(400).json({ error: 'order must be an array' })
      return
    }
    for (const item of order) {
      if (typeof item.id !== 'string' || typeof item.sortOrder !== 'number') {
        res.status(400).json({ error: 'Each item must have string id and number sortOrder' })
        return
      }
    }

    const stmt = req.roomDb!.prepare('UPDATE assets SET sort_order = ? WHERE id = ?')
    const transaction = req.roomDb!.transaction((items: { id: string; sortOrder: number }[]) => {
      for (const item of items) {
        stmt.run(item.sortOrder, item.id)
      }
    })
    transaction(order as { id: string; sortOrder: number }[])

    const rows = req
      .roomDb!.prepare('SELECT * FROM assets ORDER BY sort_order ASC, created_at DESC')
      .all() as Record<string, unknown>[]
    const assets = rows.map(toAsset)
    io.to(req.roomId!).emit('asset:reordered', assets)
    res.json(assets)
  })

  router.patch('/api/rooms/:roomId/assets/:id', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
    if (!row) {
      res.status(404).json({ error: 'Asset not found' })
      return
    }

    const body = req.body as Record<string, unknown>
    const updates: string[] = []
    const params: unknown[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      params.push(body.name)
    }
    if (body.mediaType !== undefined) {
      updates.push('media_type = ?')
      params.push(body.mediaType)
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?')
      params.push(JSON.stringify(body.tags))
    }
    if (body.sortOrder !== undefined) {
      updates.push('sort_order = ?')
      params.push(body.sortOrder)
    }

    // Merge blueprint, handout into extra JSON column
    const currentExtra = JSON.parse((row.extra as string) || '{}') as Record<string, unknown>
    let extraChanged = false
    if (body.blueprint !== undefined) {
      currentExtra.blueprint = body.blueprint
      extraChanged = true
    }
    if (body.handout !== undefined) {
      currentExtra.handout = body.handout
      extraChanged = true
    }
    if (extraChanged) {
      updates.push('extra = ?')
      params.push(JSON.stringify(currentExtra))
    }

    if (updates.length === 0) {
      res.json(toAsset(row))
      return
    }

    params.push(req.params.id)
    req.roomDb!.prepare(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    const updated = toAsset(
      req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('asset:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/assets/:id', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
    if (!row) {
      res.status(404).json({ error: 'Asset not found' })
      return
    }

    // Delete file from disk
    const filename = path.basename(row.url as string)
    const filePath = safePath(uploadsDir(req.roomId!), filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    req.roomDb!.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('asset:deleted', { id: req.params.id as string })
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
    const filePath = safePath(dataDir, 'rooms', roomId, 'uploads', filename)
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.sendFile(filePath, { dotfiles: 'allow' })
  })

  return router
}
