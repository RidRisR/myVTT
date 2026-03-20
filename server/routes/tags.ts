// server/routes/tags.ts — Tag CRUD routes
import { Router } from 'express'
import crypto from 'crypto'
import type { TypedServer } from '../socketTypes'
import { withRoom } from '../middleware'
import {
  normalizeTagName,
  validateTagName,
  getAllTags,
  toAssetWithTags,
  toBlueprintWithTags,
} from '../tagHelpers'
import type { AssetRecord } from '../../src/shared/storeTypes'
import type { Blueprint } from '../../src/shared/entityTypes'

export function tagRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  // GET /api/rooms/:roomId/tags — list all tags
  router.get('/api/rooms/:roomId/tags', room, (req, res) => {
    const tags = getAllTags(req.roomDb!)
    res.json(tags)
  })

  // POST /api/rooms/:roomId/tags — create tag
  router.post('/api/rooms/:roomId/tags', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const rawName = body.name as string | undefined
    if (!rawName || !validateTagName(rawName)) {
      res.status(400).json({ error: 'Invalid tag name' })
      return
    }
    const normalized = normalizeTagName(rawName)
    const existing = req.roomDb!.prepare('SELECT id FROM tags WHERE name = ?').get(normalized)
    if (existing) {
      res.status(409).json({ error: 'Tag already exists' })
      return
    }
    const id = crypto.randomUUID()
    const color = (body.color as string | null) ?? null
    const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0
    req
      .roomDb!.prepare(
        'INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, normalized, color, sortOrder, Date.now())
    const tag = req
      .roomDb!.prepare(
        'SELECT id, name, color, sort_order AS sortOrder, created_at AS createdAt FROM tags WHERE id = ?',
      )
      .get(id) as {
      id: string
      name: string
      color: string | null
      sortOrder: number
      createdAt: number
    }
    io.to(req.roomId!).emit('tag:created', tag)
    res.status(201).json(tag)
  })

  // PATCH /api/rooms/:roomId/tags/:id — rename/update tag
  router.patch('/api/rooms/:roomId/tags/:id', room, (req, res) => {
    const existing = req.roomDb!.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
    if (!existing) {
      res.status(404).json({ error: 'Tag not found' })
      return
    }

    const body = req.body as Record<string, unknown>
    const updates: string[] = []
    const params: unknown[] = []
    let newName: string | undefined

    if (body.name !== undefined) {
      const rawName = body.name as string
      if (!validateTagName(rawName)) {
        res.status(400).json({ error: 'Invalid tag name' })
        return
      }
      newName = normalizeTagName(rawName)
      // Check uniqueness (excluding current tag)
      const conflict = req
        .roomDb!.prepare('SELECT id FROM tags WHERE name = ? AND id != ?')
        .get(newName, req.params.id)
      if (conflict) {
        res.status(409).json({ error: 'Tag name already in use' })
        return
      }
      updates.push('name = ?')
      params.push(newName)
    }
    if (body.color !== undefined) {
      updates.push('color = ?')
      params.push(body.color)
    }
    if (body.sortOrder !== undefined) {
      updates.push('sort_order = ?')
      params.push(body.sortOrder)
    }

    if (updates.length > 0) {
      params.push(req.params.id)
      req.roomDb!.prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    }

    const tag = req
      .roomDb!.prepare(
        'SELECT id, name, color, sort_order AS sortOrder, created_at AS createdAt FROM tags WHERE id = ?',
      )
      .get(req.params.id) as {
      id: string
      name: string
      color: string | null
      sortOrder: number
      createdAt: number
    }
    io.to(req.roomId!).emit('tag:updated', tag)

    // On rename, broadcast updated entities that use this tag
    if (newName !== undefined) {
      const affectedAssets = req
        .roomDb!.prepare(
          'SELECT a.* FROM assets a JOIN asset_tags at ON a.id = at.asset_id WHERE at.tag_id = ?',
        )
        .all(req.params.id) as Record<string, unknown>[]
      for (const row of affectedAssets) {
        const asset = toAssetWithTags(req.roomDb!, row) as unknown as AssetRecord
        io.to(req.roomId!).emit('asset:updated', asset)
      }

      const affectedBlueprints = req
        .roomDb!.prepare(
          'SELECT b.* FROM blueprints b JOIN blueprint_tags bt ON b.id = bt.blueprint_id WHERE bt.tag_id = ?',
        )
        .all(req.params.id) as Record<string, unknown>[]
      for (const row of affectedBlueprints) {
        const bp = toBlueprintWithTags(req.roomDb!, row) as unknown as Blueprint
        io.to(req.roomId!).emit('blueprint:updated', bp)
      }
    }

    res.json(tag)
  })

  // DELETE /api/rooms/:roomId/tags/:id — delete tag
  router.delete('/api/rooms/:roomId/tags/:id', room, (req, res) => {
    const existing = req.roomDb!.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
    if (!existing) {
      res.status(404).json({ error: 'Tag not found' })
      return
    }

    // Collect affected IDs before CASCADE
    const affectedAssets = req
      .roomDb!.prepare(
        'SELECT a.* FROM assets a JOIN asset_tags at ON a.id = at.asset_id WHERE at.tag_id = ?',
      )
      .all(req.params.id) as Record<string, unknown>[]
    const affectedBlueprints = req
      .roomDb!.prepare(
        'SELECT b.* FROM blueprints b JOIN blueprint_tags bt ON b.id = bt.blueprint_id WHERE bt.tag_id = ?',
      )
      .all(req.params.id) as Record<string, unknown>[]

    req.roomDb!.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id)

    io.to(req.roomId!).emit('tag:deleted', { id: req.params.id })

    // Broadcast updated entities after tag removal (CASCADE has already deleted junction rows)
    for (const row of affectedAssets) {
      const asset = toAssetWithTags(req.roomDb!, row) as unknown as AssetRecord
      io.to(req.roomId!).emit('asset:updated', asset)
    }
    for (const row of affectedBlueprints) {
      const bp = toBlueprintWithTags(req.roomDb!, row) as unknown as Blueprint
      io.to(req.roomId!).emit('blueprint:updated', bp)
    }

    res.status(204).end()
  })

  return router
}
