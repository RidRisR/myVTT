// server/routes/entities.ts — Entity CRUD with deep merge for JSON fields
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import type Database from 'better-sqlite3'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields } from '../db'
import { deepMerge } from '../deepMerge'

export function toEntity(row: Record<string, unknown>) {
  return parseJsonFields(toCamel<Record<string, unknown>>(row), 'ruleData', 'permissions')
}

export function degradeTokenReferences(db: Database.Database, entityId: string) {
  // combat_state JSON
  const combatRow = db.prepare('SELECT tokens FROM combat_state WHERE id = 1').get() as
    | { tokens: string }
    | undefined
  if (combatRow) {
    const tokens = JSON.parse(combatRow.tokens || '{}')
    let changed = false
    for (const [, t] of Object.entries(tokens)) {
      if ((t as Record<string, unknown>).entityId === entityId) {
        ;(t as Record<string, unknown>).entityId = null
        changed = true
      }
    }
    if (changed) {
      db.prepare('UPDATE combat_state SET tokens = ? WHERE id = 1').run(JSON.stringify(tokens))
    }
  }

  // encounters JSON
  const encounterRows = db.prepare('SELECT id, tokens FROM encounters').all() as {
    id: string
    tokens: string
  }[]
  for (const enc of encounterRows) {
    const tokens = JSON.parse(enc.tokens || '{}')
    let changed = false
    for (const [, t] of Object.entries(tokens)) {
      if ((t as Record<string, unknown>).entityId === entityId) {
        ;(t as Record<string, unknown>).entityId = null
        changed = true
      }
    }
    if (changed) {
      db.prepare('UPDATE encounters SET tokens = ? WHERE id = ?').run(
        JSON.stringify(tokens),
        enc.id,
      )
    }
  }
}

export function entityRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/entities', room, (req, res) => {
    const rows = req.roomDb!.prepare('SELECT * FROM entities').all() as Record<string, unknown>[]
    res.json(rows.map(toEntity))
  })

  router.get('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT * FROM entities WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
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
      lifecycle = 'ephemeral',
      blueprintId = null,
    } = req.body

    const createEntity = req.roomDb!.transaction(() => {
      req
        .roomDb!.prepare(
          `INSERT INTO entities (id, name, image_url, color, size, notes, rule_data, permissions, lifecycle, blueprint_id)
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
          lifecycle,
          blueprintId,
        )

      // Persistent entities auto-link to all existing scenes
      if (lifecycle === 'persistent') {
        const scenes = req.roomDb!.prepare('SELECT id FROM scenes').all() as { id: string }[]
        const stmt = req.roomDb!.prepare(
          'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, 1)',
        )
        for (const s of scenes) {
          stmt.run(s.id, id)
        }
      }
    })
    createEntity()

    const entity = toEntity(
      req.roomDb!.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Record<string, unknown>,
    )
    io.to(req.roomId!).emit('entity:created', entity)
    res.status(201).json(entity)
  })

  router.patch('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    const existing = req
      .roomDb!.prepare('SELECT * FROM entities WHERE id = ?')
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
      lifecycle: 'lifecycle',
    }
    for (const [camel, snake] of Object.entries(simpleFields)) {
      if (req.body[camel] !== undefined) {
        sets.push(`${snake} = ?`)
        values.push(req.body[camel])
      }
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
      req.roomDb!.prepare(`UPDATE entities SET ${sets.join(', ')} WHERE id = ?`).run(...values)
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
    const existing = req.roomDb!.prepare('SELECT id FROM entities WHERE id = ?').get(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }

    const deleteEntity = req.roomDb!.transaction(() => {
      degradeTokenReferences(req.roomDb!, req.params.id)
      req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(req.params.id)
    })
    deleteEntity()

    io.to(req.roomId!).emit('entity:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  return router
}
