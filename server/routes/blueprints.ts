// server/routes/blueprints.ts — Blueprint CRUD routes
import { Router } from 'express'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import type { TypedServer } from '../socketTypes'
import type { Blueprint } from '../../src/shared/entityTypes'
import type { AssetRecord } from '../../src/shared/storeTypes'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields, safePath } from '../db'

function toBlueprint(row: Record<string, unknown>): Blueprint {
  return parseJsonFields(toCamel(row), 'defaults', 'tags') as unknown as Blueprint
}

function uploadsDir(dataDir: string, roomId: string): string {
  const dir = safePath(dataDir, 'rooms', roomId, 'uploads')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function blueprintRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/blueprints', room, (req, res) => {
    const rows = req
      .roomDb!.prepare('SELECT * FROM blueprints ORDER BY created_at DESC')
      .all() as Record<string, unknown>[]
    res.json(rows.map(toBlueprint))
  })

  router.post('/api/rooms/:roomId/blueprints/from-upload', room, (req, res) => {
    const dir = uploadsDir(dataDir, req.roomId!)
    const storage = multer.diskStorage({
      destination: dir,
      filename: (_r, file, cb) => {
        cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || '.bin'}`)
      },
    })
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const upload = multer({
      storage,
      limits: { fileSize: 200 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (allowedMimes.includes(file.mimetype)) cb(null, true)
        else cb(new Error(`File type ${file.mimetype} not allowed`))
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

      const assetId = crypto.randomUUID()
      const blueprintId = crypto.randomUUID()
      const url = `/api/rooms/${req.roomId}/uploads/${req.file.filename}`
      const body = req.body as Record<string, unknown>
      const name = (body.name as string) || req.file.originalname
      const tags = body.tags
        ? typeof body.tags === 'string'
          ? body.tags
          : JSON.stringify(body.tags)
        : '[]'
      const defaults = body.defaults
        ? typeof body.defaults === 'string'
          ? body.defaults
          : JSON.stringify(body.defaults)
        : '{"color":"#3b82f6","width":1,"height":1}'
      const now = Date.now()

      // Atomic transaction: insert asset + blueprint together
      const insertAsset = req.roomDb!.prepare(
        'INSERT INTO assets (id, url, name, media_type, tags, created_at, extra) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      const insertBlueprint = req.roomDb!.prepare(
        'INSERT INTO blueprints (id, name, image_url, tags, defaults, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )

      const transaction = req.roomDb!.transaction(() => {
        insertAsset.run(assetId, url, name, 'image', '[]', now, '{}')
        insertBlueprint.run(blueprintId, name, url, tags, defaults, now)
      })

      try {
        transaction()
      } catch {
        // Cleanup uploaded file on DB failure
        const filePath = safePath(dir, req.file.filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        res.status(500).json({ error: 'Failed to create blueprint' })
        return
      }

      const asset = parseJsonFields(
        toCamel(
          req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as Record<
            string,
            unknown
          >,
        ),
        'extra',
        'tags',
      ) as unknown as AssetRecord
      const bp = toBlueprint(
        req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(blueprintId) as Record<
          string,
          unknown
        >,
      )

      io.to(req.roomId!).emit('asset:created', asset)
      io.to(req.roomId!).emit('blueprint:created', bp)
      res.status(201).json(bp)
    })
  })

  router.post('/api/rooms/:roomId/blueprints', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const id = crypto.randomUUID()
    const name = (body.name as string) || ''
    const imageUrl = (body.imageUrl as string) || ''
    const tags = body.tags ? JSON.stringify(body.tags) : '[]'
    const defaults = body.defaults ? JSON.stringify(body.defaults) : '{}'

    req
      .roomDb!.prepare(
        'INSERT INTO blueprints (id, name, image_url, tags, defaults, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, name, imageUrl, tags, defaults, Date.now())

    const bp = toBlueprint(
      req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('blueprint:created', bp)
    res.status(201).json(bp)
  })

  router.patch('/api/rooms/:roomId/blueprints/:id', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
    if (!row) {
      res.status(404).json({ error: 'Blueprint not found' })
      return
    }

    const body = req.body as Record<string, unknown>
    const updates: string[] = []
    const params: unknown[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      params.push(body.name)
    }
    if (body.imageUrl !== undefined) {
      updates.push('image_url = ?')
      params.push(body.imageUrl)
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?')
      params.push(JSON.stringify(body.tags))
    }
    if (body.defaults !== undefined) {
      updates.push('defaults = ?')
      params.push(JSON.stringify(body.defaults))
    }

    if (updates.length === 0) {
      res.json(toBlueprint(row))
      return
    }

    params.push(req.params.id)
    req.roomDb!.prepare(`UPDATE blueprints SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    const updated = toBlueprint(
      req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('blueprint:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/blueprints/:id', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
    if (!row) {
      res.status(404).json({ error: 'Blueprint not found' })
      return
    }
    req.roomDb!.prepare('DELETE FROM blueprints WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('blueprint:deleted', { id: req.params.id as string })
    res.status(204).end()
  })

  return router
}
