// server/routes/scenes.ts — Scene CRUD + scene-entity linking
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom, withRole } from '../middleware'
import { toCamel, toCamelAll, parseJsonFields, toBoolFields } from '../db'
import { deepMerge } from '../deepMerge'

export function sceneRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function toScene(row: Record<string, unknown>) {
    const r = parseJsonFields(toCamel<Record<string, unknown>>(row), 'atmosphere')
    return toBoolFields(r, 'gmOnly')
  }

  router.get('/api/rooms/:roomId/scenes', room, withRole, (req, res) => {
    const where = req.role === 'GM' ? '' : 'WHERE gm_only = 0'
    const rows = req.roomDb!
      .prepare(`SELECT * FROM scenes ${where} ORDER BY sort_order`)
      .all() as Record<string, unknown>[]
    res.json(rows.map(toScene))
  })

  router.post('/api/rooms/:roomId/scenes', room, (req, res) => {
    const id = req.body.id || crypto.randomUUID()
    const { name, sortOrder, atmosphere, gmOnly } = req.body

    const createScene = req.roomDb!.transaction(() => {
      req.roomDb!
        .prepare(
          'INSERT INTO scenes (id, name, sort_order, atmosphere, gm_only) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          id,
          name || 'New Scene',
          sortOrder ?? 0,
          JSON.stringify(atmosphere || {}),
          gmOnly ? 1 : 0,
        )

      // Auto-link persistent entities
      const persistentEntities = req.roomDb!
        .prepare('SELECT id FROM entities WHERE persistent = 1')
        .all() as { id: string }[]
      const linkStmt = req.roomDb!.prepare(
        'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id) VALUES (?, ?)',
      )
      for (const e of persistentEntities) {
        linkStmt.run(id, e.id)
      }
    })
    createScene()

    const scene = toScene(
      req.roomDb!.prepare('SELECT * FROM scenes WHERE id = ?').get(id) as Record<string, unknown>,
    )
    io.to(req.roomId!).emit('scene:created', scene)
    res.status(201).json(scene)
  })

  router.patch('/api/rooms/:roomId/scenes/:id', room, (req, res) => {
    const existing = req.roomDb!
      .prepare('SELECT * FROM scenes WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined
    if (!existing) {
      res.status(404).json({ error: 'Scene not found' })
      return
    }

    const sets: string[] = []
    const values: unknown[] = []

    if (req.body.name !== undefined) {
      sets.push('name = ?')
      values.push(req.body.name)
    }
    if (req.body.sortOrder !== undefined) {
      sets.push('sort_order = ?')
      values.push(req.body.sortOrder)
    }
    if (req.body.gmOnly !== undefined) {
      sets.push('gm_only = ?')
      values.push(req.body.gmOnly ? 1 : 0)
    }
    if (req.body.atmosphere !== undefined) {
      const existingAtmo = JSON.parse((existing.atmosphere as string) || '{}')
      const merged = deepMerge(existingAtmo, req.body.atmosphere)
      sets.push('atmosphere = ?')
      values.push(JSON.stringify(merged))
    }

    if (sets.length > 0) {
      values.push(req.params.id)
      req.roomDb!
        .prepare(`UPDATE scenes SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values)
    }

    const updated = toScene(
      req.roomDb!.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('scene:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/scenes/:id', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM scenes WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('scene:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  // Scene-entity linking
  router.post('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
    req.roomDb!
      .prepare('INSERT OR IGNORE INTO scene_entities (scene_id, entity_id) VALUES (?, ?)')
      .run(req.params.sceneId, req.params.entityId)
    io.to(req.roomId!).emit('scene:entity:linked', {
      sceneId: req.params.sceneId,
      entityId: req.params.entityId,
    })
    res.json({ ok: true })
  })

  router.delete('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
    req.roomDb!
      .prepare('DELETE FROM scene_entities WHERE scene_id = ? AND entity_id = ?')
      .run(req.params.sceneId, req.params.entityId)
    io.to(req.roomId!).emit('scene:entity:unlinked', {
      sceneId: req.params.sceneId,
      entityId: req.params.entityId,
    })
    res.json({ ok: true })
  })

  // Get entity IDs for a scene
  router.get('/api/rooms/:roomId/scenes/:sceneId/entities', room, (req, res) => {
    const rows = req.roomDb!
      .prepare('SELECT entity_id FROM scene_entities WHERE scene_id = ?')
      .all(req.params.sceneId) as { entity_id: string }[]
    res.json(rows.map((r) => r.entity_id))
  })

  return router
}
