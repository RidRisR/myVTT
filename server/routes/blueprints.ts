// server/routes/blueprints.ts — Blueprint CRUD routes
import { Router } from 'express'
import crypto from 'crypto'
import type { TypedServer } from '../socketTypes'
import type { Blueprint } from '../../src/shared/entityTypes'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields } from '../db'

function toBlueprint(row: Record<string, unknown>): Blueprint {
  return parseJsonFields(toCamel(row), 'defaults', 'tags') as unknown as Blueprint
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
