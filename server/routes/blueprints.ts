// server/routes/blueprints.ts — Blueprint CRUD routes
import { Router } from 'express'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import type { TypedServer } from '../socketTypes'
import type { Blueprint } from '../../src/shared/entityTypes'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields, safePath } from '../db'
import { syncTags, toBlueprintWithTags } from '../tagHelpers'

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
    res.json(rows.map((row) => toBlueprintWithTags(req.roomDb!, row)))
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
      const tagNames: string[] = body.tags
        ? typeof body.tags === 'string'
          ? (JSON.parse(body.tags) as string[])
          : Array.isArray(body.tags)
            ? (body.tags as string[])
            : []
        : []

      // Build defaults in { components: {...} } format
      let defaults: string
      if (body.defaults) {
        const parsed =
          typeof body.defaults === 'string'
            ? (JSON.parse(body.defaults) as Record<string, unknown>)
            : (body.defaults as Record<string, unknown>)
        // If caller already sent { components: {...} }, use as-is; otherwise wrap
        if (parsed.components) {
          defaults = JSON.stringify(parsed)
        } else {
          defaults = JSON.stringify({ components: parsed })
        }
      } else {
        // Default: put identity info into core:identity component
        defaults = JSON.stringify({
          components: {
            'core:identity': { name, imageUrl: url, color: '#3b82f6' },
            'core:token': { width: 1, height: 1 },
          },
        })
      }
      const now = Date.now()

      // Atomic transaction: insert asset + blueprint together
      const insertAsset = req.roomDb!.prepare(
        "INSERT INTO assets (id, url, name, media_type, category, created_at, extra) VALUES (?, ?, ?, 'image', 'token', ?, '{}')",
      )
      const insertBlueprint = req.roomDb!.prepare(
        'INSERT INTO blueprints (id, defaults, created_at) VALUES (?, ?, ?)',
      )

      const transaction = req.roomDb!.transaction(() => {
        insertAsset.run(assetId, url, name, now)
        insertBlueprint.run(blueprintId, defaults, now)
      })

      try {
        transaction()
        syncTags(req.roomDb!, 'blueprint_tags', 'blueprint_id', blueprintId, tagNames)
      } catch {
        // Cleanup uploaded file on DB failure
        const filePath = safePath(dir, req.file.filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        res.status(500).json({ error: 'Failed to create blueprint' })
        return
      }

      const assetRow = req
        .roomDb!.prepare('SELECT * FROM assets WHERE id = ?')
        .get(assetId) as Record<string, unknown>
      const assetForEmit = parseJsonFields(toCamel(assetRow), 'extra') as never
      // Tags are empty for a freshly uploaded asset
      ;(assetForEmit as Record<string, unknown>).tags = []

      const bp = toBlueprintWithTags(
        req.roomDb!,
        req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(blueprintId) as Record<
          string,
          unknown
        >,
      ) as unknown as Blueprint

      io.to(req.roomId!).emit('asset:created', assetForEmit)
      io.to(req.roomId!).emit('blueprint:created', bp)
      res.status(201).json(bp)
    })
  })

  router.post('/api/rooms/:roomId/blueprints', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const id = crypto.randomUUID()
    const tagNames: string[] = Array.isArray(body.tags) ? (body.tags as string[]) : []
    const defaults = body.defaults ? JSON.stringify(body.defaults) : '{"components":{}}'

    req
      .roomDb!.prepare('INSERT INTO blueprints (id, defaults, created_at) VALUES (?, ?, ?)')
      .run(id, defaults, Date.now())
    syncTags(req.roomDb!, 'blueprint_tags', 'blueprint_id', id, tagNames)

    const bp = toBlueprintWithTags(
      req.roomDb!,
      req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(id) as Record<
        string,
        unknown
      >,
    ) as unknown as Blueprint
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

    if (body.defaults !== undefined) {
      updates.push('defaults = ?')
      params.push(JSON.stringify(body.defaults))
    }

    if (updates.length === 0 && body.tags === undefined) {
      res.json(toBlueprintWithTags(req.roomDb!, row))
      return
    }

    if (updates.length > 0) {
      params.push(req.params.id)
      req.roomDb!.prepare(`UPDATE blueprints SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    }

    if (body.tags !== undefined) {
      const tagNames = Array.isArray(body.tags) ? (body.tags as string[]) : []
      syncTags(req.roomDb!, 'blueprint_tags', 'blueprint_id', req.params.id as string, tagNames)
    }

    const updated = toBlueprintWithTags(
      req.roomDb!,
      req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    ) as unknown as Blueprint
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
