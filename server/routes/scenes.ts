// server/routes/scenes.ts — Scene CRUD + scene-entity linking
import { Router } from 'express'
import crypto from 'crypto'
import type { TypedServer } from '../socketTypes'
import type { Scene } from '../../src/shared/storeTypes'
import { withRoom, withRole } from '../middleware'
import { toCamel, parseJsonFields, toBoolFields } from '../db'
import { deepMerge } from '../deepMerge'
import { degradeTokenReferences, loadEntity } from './entities'
import { syncTags } from '../tagHelpers'

export function sceneRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function toScene(row: Record<string, unknown>): Scene {
    const r = parseJsonFields(toCamel(row), 'atmosphere')
    return toBoolFields(r, 'gmOnly') as unknown as Scene
  }

  router.get('/api/rooms/:roomId/scenes', room, withRole, (req, res) => {
    const where = req.role === 'GM' ? '' : 'WHERE gm_only = 0'
    const rows = req
      .roomDb!.prepare(`SELECT * FROM scenes ${where} ORDER BY sort_order`)
      .all() as Record<string, unknown>[]
    res.json(rows.map(toScene))
  })

  router.post('/api/rooms/:roomId/scenes', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const id = (body.id as string | undefined) || crypto.randomUUID()
    const { name, sortOrder, atmosphere, gmOnly } = body

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

    const body = req.body as Record<string, unknown>
    const sets: string[] = []
    const values: unknown[] = []

    if (body.name !== undefined) {
      sets.push('name = ?')
      values.push(body.name)
    }
    if (body.sortOrder !== undefined) {
      sets.push('sort_order = ?')
      values.push(body.sortOrder)
    }
    if (body.gmOnly !== undefined) {
      sets.push('gm_only = ?')
      values.push(body.gmOnly ? 1 : 0)
    }
    if (body.atmosphere !== undefined) {
      const existingAtmo = JSON.parse((existing.atmosphere as string) || '{}') as Record<
        string,
        unknown
      >
      const merged = deepMerge(existingAtmo, body.atmosphere as Record<string, unknown>)
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
    // Room must always have at least one scene
    const sceneCount = (
      req.roomDb!.prepare('SELECT COUNT(*) as cnt FROM scenes').get() as { cnt: number }
    ).cnt
    if (sceneCount <= 1) {
      res.status(400).json({ error: 'Cannot delete the last scene' })
      return
    }

    // Find scene/tactical entities linked to this scene (via scene_entities)
    const linkedCleanupEntities = req
      .roomDb!.prepare(
        `SELECT e.id FROM entities e
         JOIN scene_entities se ON se.entity_id = e.id
         WHERE se.scene_id = ? AND e.lifecycle IN ('scene', 'tactical')`,
      )
      .all(req.params.id) as { id: string }[]

    // Find tactical-only orphans (have tactical_tokens but no scene_entities link)
    const tacticalOrphans = req
      .roomDb!.prepare(
        `SELECT DISTINCT e.id FROM entities e
         JOIN tactical_tokens t ON t.entity_id = e.id
         WHERE t.scene_id = ? AND e.lifecycle = 'tactical'
           AND NOT EXISTS (SELECT 1 FROM scene_entities se WHERE se.entity_id = e.id)`,
      )
      .all(req.params.id) as { id: string }[]

    const entitiesToClean = [...linkedCleanupEntities, ...tacticalOrphans]

    const deleteScene = req.roomDb!.transaction(() => {
      // Degrade token references and delete scoped entities
      // (CASCADE handles entity_components + entity_tags)
      for (const e of entitiesToClean) {
        degradeTokenReferences(req.roomDb!, e.id)
        req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(e.id)
      }
      // Clear dangling room_state reference
      req
        .roomDb!.prepare(
          `UPDATE room_state SET
           active_scene_id = CASE WHEN active_scene_id = ? THEN NULL ELSE active_scene_id END
           WHERE id = 1`,
        )
        .run(req.params.id)
      // Delete scene (CASCADE handles scene_entities, archives, tactical_state)
      req.roomDb!.prepare('DELETE FROM scenes WHERE id = ?').run(req.params.id)
    })
    deleteScene()

    // Emit entity:deleted for each cleaned-up entity
    for (const e of entitiesToClean) {
      io.to(req.roomId!).emit('entity:deleted', { id: e.id })
    }
    io.to(req.roomId!).emit('scene:deleted', { id: req.params.id as string })
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

    // Tactical and scene entities can only be in one scene
    if (entity.lifecycle === 'tactical' || entity.lifecycle === 'scene') {
      const existing = req
        .roomDb!.prepare('SELECT scene_id FROM scene_entities WHERE entity_id = ?')
        .get(req.params.entityId) as { scene_id: string } | undefined
      if (existing && existing.scene_id !== req.params.sceneId) {
        res.status(400).json({ error: 'This entity is already linked to another scene' })
        return
      }
    }

    const linkBody = (req.body ?? {}) as Record<string, unknown>
    const visibleRaw = linkBody.visible
    const visibleFlag = visibleRaw === undefined || visibleRaw === null ? true : Boolean(visibleRaw)
    req
      .roomDb!.prepare(
        'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, ?)',
      )
      .run(req.params.sceneId, req.params.entityId, visibleFlag ? 1 : 0)
    const payload = {
      sceneId: req.params.sceneId as string,
      entityId: req.params.entityId as string,
      visible: visibleFlag,
    }
    io.to(req.roomId!).emit('scene:entity:linked', payload)
    res.json({ ok: true })
  })

  router.delete('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
    // Check entity lifecycle before unlinking
    const entity = req
      .roomDb!.prepare('SELECT lifecycle FROM entities WHERE id = ?')
      .get(req.params.entityId) as { lifecycle: string } | undefined
    const isScoped = entity?.lifecycle === 'tactical' || entity?.lifecycle === 'scene'

    // Keep scoped entities alive if they still have a tactical token (demotion case)
    const hasTacticalToken = req
      .roomDb!.prepare('SELECT 1 FROM tactical_tokens WHERE entity_id = ? LIMIT 1')
      .get(req.params.entityId)
    const shouldDeleteEntity = isScoped && !hasTacticalToken

    const unlinkEntity = req.roomDb!.transaction(() => {
      req
        .roomDb!.prepare('DELETE FROM scene_entities WHERE scene_id = ? AND entity_id = ?')
        .run(req.params.sceneId, req.params.entityId)

      // Only delete scoped entities that have no tactical tokens
      // (CASCADE handles entity_components + entity_tags)
      if (shouldDeleteEntity) {
        degradeTokenReferences(req.roomDb!, req.params.entityId as string)
        req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(req.params.entityId)
      }
    })
    unlinkEntity()

    if (shouldDeleteEntity) {
      io.to(req.roomId!).emit('entity:deleted', { id: req.params.entityId as string })
    }
    io.to(req.roomId!).emit('scene:entity:unlinked', {
      sceneId: req.params.sceneId as string,
      entityId: req.params.entityId as string,
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
    const { visible } = req.body as Record<string, unknown>
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
      sceneId: req.params.sceneId as string,
      entityId: req.params.entityId as string,
      visible: !!visible,
    }
    io.to(req.roomId!).emit('scene:entity:updated', payload)
    res.json(payload)
  })

  // Spawn entity from blueprint
  router.post('/api/rooms/:roomId/scenes/:sceneId/spawn', room, (req, res) => {
    const { blueprintId, tacticalOnly } = req.body as Record<string, unknown>
    if (!blueprintId) {
      res.status(400).json({ error: 'blueprintId is required' })
      return
    }

    const bpRow = req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(blueprintId) as
      | Record<string, unknown>
      | undefined
    if (!bpRow) {
      res.status(404).json({ error: 'Blueprint not found' })
      return
    }
    const defaults = JSON.parse((bpRow.defaults as string) || '{"components":{}}') as Record<
      string,
      unknown
    >
    const bpComponents = (defaults.components || {}) as Record<string, unknown>

    // Derive name from core:identity component for the counter
    const identity = (bpComponents['core:identity'] || {}) as Record<string, unknown>
    const baseName = (identity.name as string) || 'NPC'

    const count = req
      .roomDb!.prepare('SELECT COUNT(*) as c FROM entities WHERE blueprint_id = ?')
      .get(blueprintId) as { c: number }
    const spawnName = `${baseName} ${count.c + 1}`

    const entityId = 'e-' + crypto.randomUUID().slice(0, 8)
    const db = req.roomDb!

    const spawnEntity = db.transaction(() => {
      db.prepare(
        `INSERT INTO entities (id, permissions, lifecycle, blueprint_id)
         VALUES (?, ?, 'tactical', ?)`,
      ).run(entityId, JSON.stringify({ default: 'observer', seats: {} }), blueprintId)

      // Insert components from blueprint defaults, override name with spawn counter
      const insertComp = db.prepare(
        'INSERT INTO entity_components (entity_id, component_key, data) VALUES (?, ?, ?)',
      )
      for (const [key, data] of Object.entries(bpComponents)) {
        let compData = data
        if (key === 'core:identity') {
          // Override name with numbered spawn name
          compData = { ...(data as Record<string, unknown>), name: spawnName }
        }
        insertComp.run(entityId, key, JSON.stringify(compData))
      }

      // Copy blueprint tags to entity
      const bpTags = db
        .prepare(
          'SELECT t.name FROM tags t JOIN blueprint_tags bt ON t.id = bt.tag_id WHERE bt.blueprint_id = ?',
        )
        .all(blueprintId) as { name: string }[]
      if (bpTags.length > 0) {
        syncTags(
          db,
          'entity_tags',
          'entity_id',
          entityId,
          bpTags.map((t) => t.name),
        )
      }

      // Only create scene_entity_entry if NOT tactical-only (tactical objects skip this)
      if (!tacticalOnly) {
        db.prepare(
          'INSERT INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, 1)',
        ).run(req.params.sceneId, entityId)
      }
    })
    spawnEntity()

    const entity = loadEntity(db, entityId)!

    io.to(req.roomId!).emit('entity:created', entity)
    if (!tacticalOnly) {
      io.to(req.roomId!).emit('scene:entity:linked', {
        sceneId: req.params.sceneId as string,
        entityId,
        visible: true,
      })
    }
    res.status(201).json({
      entity,
      sceneEntity: tacticalOnly ? null : { sceneId: req.params.sceneId, entityId, visible: true },
    })
  })

  return router
}
