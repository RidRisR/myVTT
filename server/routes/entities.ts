// server/routes/entities.ts — Entity CRUD with deep merge for JSON fields
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'
import { toCamel, toCamelAll, parseJsonFields, toBoolFields } from '../db'
import { deepMerge } from '../deepMerge'

export function entityRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function toEntity(row: Record<string, unknown>) {
    const r = parseJsonFields(toCamel<Record<string, unknown>>(row), 'ruleData', 'permissions')
    return toBoolFields(r, 'persistent')
  }

  router.get('/api/rooms/:roomId/entities', room, (req, res) => {
    const rows = req.roomDb!.prepare('SELECT * FROM entities').all() as Record<string, unknown>[]
    res.json(rows.map(toEntity))
  })

  router.get('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    const row = req.roomDb!
      .prepare('SELECT * FROM entities WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined
    if (!row) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }
    res.json(toEntity(row))
  })

  router.post('/api/rooms/:roomId/entities', room, (req, res) => {
    const id = req.body.id || 'e-' + crypto.randomUUID().slice(0, 8)
    const {
      name = '',
      imageUrl = '',
      color = '#888888',
      size = 1,
      notes = '',
      ruleData = {},
      permissions = { default: 'observer', seats: {} },
      persistent = false,
      blueprintId = null,
    } = req.body

    const createEntity = req.roomDb!.transaction(() => {
      req.roomDb!
        .prepare(
          `INSERT INTO entities (id, name, image_url, color, size, notes, rule_data, permissions, persistent, blueprint_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          name,
          imageUrl,
          color,
          size,
          notes,
          JSON.stringify(ruleData),
          JSON.stringify(permissions),
          persistent ? 1 : 0,
          blueprintId,
        )

      // Persistent entities auto-link to all existing scenes
      if (persistent) {
        const scenes = req.roomDb!.prepare('SELECT id FROM scenes').all() as { id: string }[]
        const stmt = req.roomDb!.prepare(
          'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id) VALUES (?, ?)',
        )
        for (const s of scenes) {
          stmt.run(s.id, id)
        }
      }
    })
    createEntity()

    const entity = toEntity(
      req.roomDb!.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('entity:created', entity)
    res.status(201).json(entity)
  })

  router.patch('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    const existing = req.roomDb!
      .prepare('SELECT * FROM entities WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }

    const sets: string[] = []
    const values: unknown[] = []

    // Simple fields (camelCase body → snake_case DB)
    const simpleFields: Record<string, string> = {
      name: 'name',
      imageUrl: 'image_url',
      color: 'color',
      size: 'size',
      notes: 'notes',
      blueprintId: 'blueprint_id',
    }
    for (const [camel, snake] of Object.entries(simpleFields)) {
      if (req.body[camel] !== undefined) {
        sets.push(`${snake} = ?`)
        values.push(req.body[camel])
      }
    }
    if (req.body.persistent !== undefined) {
      sets.push('persistent = ?')
      values.push(req.body.persistent ? 1 : 0)
    }

    // JSON fields — deep merge
    if (req.body.ruleData !== undefined) {
      const existingData = JSON.parse((existing.rule_data as string) || '{}')
      const merged = deepMerge(existingData, req.body.ruleData)
      sets.push('rule_data = ?')
      values.push(JSON.stringify(merged))
    }
    if (req.body.permissions !== undefined) {
      const existingPerms = JSON.parse((existing.permissions as string) || '{}')
      const merged = deepMerge(existingPerms, req.body.permissions)
      sets.push('permissions = ?')
      values.push(JSON.stringify(merged))
    }

    if (sets.length > 0) {
      values.push(req.params.id)
      req.roomDb!
        .prepare(`UPDATE entities SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values)
    }

    const updated = toEntity(
      req.roomDb!.prepare('SELECT * FROM entities WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('entity:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('entity:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  return router
}
