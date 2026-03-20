// server/routes/assets.ts — Asset upload + management
import { Router } from 'express'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import type { TypedServer } from '../socketTypes'
import type { AssetRecord } from '../../src/shared/storeTypes'
import { withRoom } from '../middleware'
import { safePath } from '../db'
import { syncTags, toAssetWithTags } from '../tagHelpers'

const VALID_CATEGORIES = ['map', 'token'] as const

export function assetRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function uploadsDir(roomId: string): string {
    const dir = safePath(dataDir, 'rooms', roomId, 'uploads')
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  router.get('/api/rooms/:roomId/assets', room, (req, res) => {
    let query = 'SELECT * FROM assets WHERE 1=1'
    const params: unknown[] = []
    if (req.query.mediaType) {
      query += ' AND media_type = ?'
      params.push(req.query.mediaType)
    }
    if (req.query.category) {
      query += ' AND category = ?'
      params.push(req.query.category)
    }
    query += ' ORDER BY sort_order ASC, created_at DESC'
    const rows = req.roomDb!.prepare(query).all(...params) as Record<string, unknown>[]
    res.json(rows.map((row) => toAssetWithTags(req.roomDb!, row)))
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
      const rawCategory = (uploadBody.category as string) || 'map'
      const category = VALID_CATEGORIES.includes(rawCategory as (typeof VALID_CATEGORIES)[number])
        ? rawCategory
        : 'map'
      const extra = uploadBody.extra
        ? (JSON.parse(uploadBody.extra as string) as Record<string, unknown>)
        : {}
      // Extract tags from FormData or extra, then strip from extra before storing
      // FormData values are always strings, so also try JSON.parse for array-valued fields
      let rawTags = uploadBody.tags
      if (typeof rawTags === 'string') {
        try {
          rawTags = JSON.parse(rawTags)
        } catch {
          rawTags = []
        }
      }
      const tagNames: string[] = Array.isArray(rawTags)
        ? (rawTags as string[])
        : Array.isArray(extra.tags)
          ? (extra.tags as string[])
          : []
      delete extra.tags

      try {
        req
          .roomDb!.prepare(
            'INSERT INTO assets (id, url, name, media_type, category, created_at, extra) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(id, url, name, mediaType, category, Date.now(), JSON.stringify(extra))
        syncTags(req.roomDb!, 'asset_tags', 'asset_id', id, tagNames)
      } catch {
        // Atomic cleanup: DB insert failed → remove orphaned file
        const filePath = safePath(dir, req.file.filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        res.status(500).json({ error: 'Failed to save asset metadata' })
        return
      }

      const asset = toAssetWithTags(
        req.roomDb!,
        req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>,
      ) as unknown as AssetRecord
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
    for (const item of order as Record<string, unknown>[]) {
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
    const assets = rows.map((row) => toAssetWithTags(req.roomDb!, row)) as unknown as AssetRecord[]
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
    if (body.category !== undefined) {
      const rawCategory = body.category as string
      if (!VALID_CATEGORIES.includes(rawCategory as (typeof VALID_CATEGORIES)[number])) {
        res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` })
        return
      }
      updates.push('category = ?')
      params.push(rawCategory)
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

    if (updates.length === 0 && body.tags === undefined) {
      res.json(toAssetWithTags(req.roomDb!, row))
      return
    }

    if (updates.length > 0) {
      params.push(req.params.id)
      req.roomDb!.prepare(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    }

    if (body.tags !== undefined) {
      const tagNames = Array.isArray(body.tags) ? (body.tags as string[]) : []
      syncTags(req.roomDb!, 'asset_tags', 'asset_id', req.params.id, tagNames)
    }

    const updated = toAssetWithTags(
      req.roomDb!,
      req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    ) as unknown as AssetRecord
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
