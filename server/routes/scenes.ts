// server/routes/scenes.ts — Scene CRUD + scene-entity linking
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom, withRole } from '../middleware'
import { toCamel, parseJsonFields, toBoolFields } from '../db'
import { deepMerge } from '../deepMerge'
import { degradeTokenReferences, toEntity } from './entities'

export function sceneRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function toScene(row: Record<string, unknown>) {
    const r = parseJsonFields(toCamel(row), 'atmosphere')
    return toBoolFields(r, 'gmOnly')
  }

  router.get('/api/rooms/:roomId/scenes', room, withRole, (req, res) => {
    const where = req.role === 'GM' ? '' : 'WHERE gm_only = 0'
    const rows = req
      .roomDb!.prepare(`SELECT * FROM scenes ${where} ORDER BY sort_order`)
      .all() as Record<string, unknown>[]
    res.json(rows.map(toScene))
  })

  router.post('/api/rooms/:roomId/scenes', room, (req, res) => {
    const id = req.body.id || crypto.randomUUID()
    const { name, sortOrder, atmosphere, gmOnly } = req.body

    const createScene = req.roomDb!.transaction(() => {
      req
        .roomDb!.prepare(
          'INSERT INTO scenes (id, name, sort_order, atmosphere, gm_only) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          id,
          name || 'New Scene',
          sortOrder ?? 0,
          JSON.stringify(atmosphere || {}),
          gmOnly ? 1 : 0,
        )

      // Auto-create tactical_state for this scene
      req.roomDb!.prepare('INSERT INTO tactical_state (scene_id) VALUES (?)').run(id)

      // Auto-link persistent entities
      const persistentEntities = req
        .roomDb!.prepare("SELECT id FROM entities WHERE lifecycle = 'persistent'")
        .all() as { id: string }[]
      const linkStmt = req.roomDb!.prepare(
        'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, 1)',
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
    const existing = req.roomDb!.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
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
      req.roomDb!.prepare(`UPDATE scenes SET ${sets.join(', ')} WHERE id = ?`).run(...values)
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
    // Find ephemeral entities linked only to this scene
    const ephemeralEntities = req
      .roomDb!.prepare(
        `SELECT e.id FROM entities e
         JOIN scene_entities se ON se.entity_id = e.id
         WHERE se.scene_id = ? AND e.lifecycle = 'ephemeral'`,
      )
      .all(req.params.id) as { id: string }[]

    const deleteScene = req.roomDb!.transaction(() => {
      // Degrade token references and delete ephemeral entities
      for (const e of ephemeralEntities) {
        degradeTokenReferences(req.roomDb!, e.id)
        req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(e.id)
      }
      // Clear dangling room_state references
      req
        .roomDb!.prepare(
          `UPDATE room_state SET
           active_scene_id = CASE WHEN active_scene_id = ? THEN NULL ELSE active_scene_id END,
           active_archive_id = CASE WHEN active_scene_id = ? THEN NULL ELSE active_archive_id END
           WHERE id = 1`,
        )
        .run(req.params.id, req.params.id)
      // Delete scene (CASCADE handles scene_entities, archives, tactical_state)
      req.roomDb!.prepare('DELETE FROM scenes WHERE id = ?').run(req.params.id)
    })
    deleteScene()

    // Emit entity:deleted for each ephemeral entity
    for (const e of ephemeralEntities) {
      io.to(req.roomId!).emit('entity:deleted', { id: e.id })
    }
    io.to(req.roomId!).emit('scene:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  // Scene-entity linking
  router.post('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
    // Look up entity lifecycle
    const entity = req
      .roomDb!.prepare('SELECT lifecycle FROM entities WHERE id = ?')
      .get(req.params.entityId) as { lifecycle: string } | undefined
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }

    // Ephemeral entities can only be in one scene
    if (entity.lifecycle === 'ephemeral') {
      const existing = req
        .roomDb!.prepare('SELECT scene_id FROM scene_entities WHERE entity_id = ?')
        .get(req.params.entityId) as { scene_id: string } | undefined
      if (existing && existing.scene_id !== req.params.sceneId) {
        res.status(400).json({ error: 'Ephemeral entity is already linked to another scene' })
        return
      }
    }

    const visible = req.body?.visible ?? 1
    req
      .roomDb!.prepare(
        'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, ?)',
      )
      .run(req.params.sceneId, req.params.entityId, visible ? 1 : 0)
    const payload = {
      sceneId: req.params.sceneId,
      entityId: req.params.entityId,
      visible: visible === 1 || visible === true,
    }
    io.to(req.roomId!).emit('scene:entity:linked', payload)
    res.json({ ok: true })
  })

  router.delete('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
    // Check entity lifecycle before unlinking
    const entity = req
      .roomDb!.prepare('SELECT lifecycle FROM entities WHERE id = ?')
      .get(req.params.entityId) as { lifecycle: string } | undefined
    const isEphemeral = entity?.lifecycle === 'ephemeral'

    const unlinkEntity = req.roomDb!.transaction(() => {
      req
        .roomDb!.prepare('DELETE FROM scene_entities WHERE scene_id = ? AND entity_id = ?')
        .run(req.params.sceneId, req.params.entityId)

      // If ephemeral, also delete the entity
      if (isEphemeral) {
        degradeTokenReferences(req.roomDb!, req.params.entityId)
        req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(req.params.entityId)
      }
    })
    unlinkEntity()

    if (isEphemeral) {
      io.to(req.roomId!).emit('entity:deleted', { id: req.params.entityId })
    }
    io.to(req.roomId!).emit('scene:entity:unlinked', {
      sceneId: req.params.sceneId,
      entityId: req.params.entityId,
    })
    res.json({ ok: true })
  })

  // Get entity IDs for a scene
  router.get('/api/rooms/:roomId/scenes/:sceneId/entities', room, (req, res) => {
    const rows = req
      .roomDb!.prepare('SELECT entity_id, visible FROM scene_entities WHERE scene_id = ?')
      .all(req.params.sceneId) as { entity_id: string; visible: number }[]
    res.json(rows.map((r) => ({ entityId: r.entity_id, visible: r.visible === 1 })))
  })

  // Update scene-entity link (toggle visible)
  router.patch('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
    const { visible } = req.body
    if (visible === undefined) {
      res.status(400).json({ error: 'visible is required' })
      return
    }
    const result = req
      .roomDb!.prepare('UPDATE scene_entities SET visible = ? WHERE scene_id = ? AND entity_id = ?')
      .run(visible ? 1 : 0, req.params.sceneId, req.params.entityId)
    if (result.changes === 0) {
      res.status(404).json({ error: 'Scene-entity link not found' })
      return
    }
    const payload = {
      sceneId: req.params.sceneId,
      entityId: req.params.entityId,
      visible: !!visible,
    }
    io.to(req.roomId!).emit('scene:entity:updated', payload)
    res.json(payload)
  })

  // Spawn entity from blueprint
  router.post('/api/rooms/:roomId/scenes/:sceneId/spawn', room, (req, res) => {
    const { blueprintId } = req.body
    if (!blueprintId) {
      res.status(400).json({ error: 'blueprintId is required' })
      return
    }

    const asset = req
      .roomDb!.prepare("SELECT * FROM assets WHERE id = ? AND type = 'blueprint'")
      .get(blueprintId) as Record<string, unknown> | undefined
    if (!asset) {
      res.status(404).json({ error: 'Blueprint not found' })
      return
    }
    const extra = JSON.parse((asset.extra as string) || '{}')
    const bp = extra.blueprint || {}

    const count = req
      .roomDb!.prepare('SELECT COUNT(*) as c FROM entities WHERE blueprint_id = ?')
      .get(blueprintId) as { c: number }
    const name = `${(asset.name as string) || 'NPC'} ${count.c + 1}`

    const entityId = 'e-' + crypto.randomUUID().slice(0, 8)

    const spawnEntity = req.roomDb!.transaction(() => {
      req
        .roomDb!.prepare(
          `INSERT INTO entities (id, name, image_url, color, width, height, notes, rule_data, permissions, lifecycle, blueprint_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ephemeral', ?)`,
        )
        .run(
          entityId,
          name,
          asset.url || '',
          bp.defaultColor || '#888888',
          bp.defaultSize || 1,
          bp.defaultSize || 1,
          '',
          JSON.stringify(bp.defaultRuleData || {}),
          JSON.stringify({ default: 'observer', seats: {} }),
          blueprintId,
        )

      req
        .roomDb!.prepare(
          'INSERT INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, 1)',
        )
        .run(req.params.sceneId, entityId)
    })
    spawnEntity()

    const entity = toEntity(
      req.roomDb!.prepare('SELECT * FROM entities WHERE id = ?').get(entityId) as Record<
        string,
        unknown
      >,
    )

    io.to(req.roomId!).emit('entity:created', entity)
    io.to(req.roomId!).emit('scene:entity:linked', {
      sceneId: req.params.sceneId,
      entityId,
      visible: true,
    })
    res.status(201).json({
      entity,
      sceneEntity: { sceneId: req.params.sceneId, entityId, visible: true },
    })
  })

  return router
}
