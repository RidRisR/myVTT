// server/routes/tactical.ts — Tactical (combat) state API (per-scene)
import { Router } from 'express'
import crypto from 'crypto'
import type { TypedServer } from '../socketTypes'
import type { TacticalInfo } from '../../src/shared/storeTypes'
import type { MapToken } from '../../src/shared/entityTypes'
import type Database from 'better-sqlite3'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields } from '../db'
import { loadEntity } from './entities'

function toToken(row: Record<string, unknown>): MapToken {
  return {
    id: row.id,
    entityId: row.entity_id,
    sceneId: row.scene_id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    imageScaleX: row.image_scale_x ?? 1,
    imageScaleY: row.image_scale_y ?? 1,
    initiativePosition: row.initiative_position ?? null,
  } as unknown as MapToken
}

export function getTacticalState(db: Database.Database, sceneId: string): TacticalInfo | null {
  const stateRow = db.prepare('SELECT * FROM tactical_state WHERE scene_id = ?').get(sceneId) as
    | Record<string, unknown>
    | undefined
  if (!stateRow) return null

  const state = parseJsonFields(toCamel(stateRow), 'grid')

  const tokenRows = db
    .prepare('SELECT * FROM tactical_tokens WHERE scene_id = ?')
    .all(sceneId) as Record<string, unknown>[]

  return {
    ...state,
    tokens: tokenRows.map(toToken),
  } as unknown as TacticalInfo
}

function getActiveSceneId(db: Database.Database): string | null {
  const roomState = db.prepare('SELECT active_scene_id FROM room_state WHERE id = 1').get() as {
    active_scene_id: string | null
  }
  return roomState.active_scene_id
}

export function tacticalRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  // GET /tactical — returns current tactical state for active scene
  router.get('/api/rooms/:roomId/tactical', room, (req, res) => {
    const sceneId = getActiveSceneId(req.roomDb!)
    if (!sceneId) {
      res.status(404).json({ error: 'No active scene' })
      return
    }

    const state = getTacticalState(req.roomDb!, sceneId)
    if (!state) {
      res.status(404).json({ error: 'No tactical state for active scene' })
      return
    }

    res.json(state)
  })

  // PATCH /tactical — update tactical_state fields
  router.patch('/api/rooms/:roomId/tactical', room, (req, res) => {
    const sceneId = getActiveSceneId(req.roomDb!)
    if (!sceneId) {
      res.status(404).json({ error: 'No active scene' })
      return
    }

    const patchBody = req.body as Record<string, unknown>
    const doPatch = req.roomDb!.transaction(() => {
      const sets: string[] = []
      const values: unknown[] = []

      const simpleFields: Record<string, string> = {
        mapUrl: 'map_url',
        mapWidth: 'map_width',
        mapHeight: 'map_height',
        roundNumber: 'round_number',
        currentTurnTokenId: 'current_turn_token_id',
        tacticalMode: 'tactical_mode',
      }
      for (const [camel, snake] of Object.entries(simpleFields)) {
        if (patchBody[camel] !== undefined) {
          sets.push(`${snake} = ?`)
          values.push(patchBody[camel])
        }
      }

      // Grid: deep merge with existing values (inside transaction to avoid races)
      if (patchBody.grid !== undefined) {
        const existing = req
          .roomDb!.prepare('SELECT grid FROM tactical_state WHERE scene_id = ?')
          .get(sceneId) as { grid: string }
        const existingGrid = JSON.parse(existing.grid || '{}') as Record<string, unknown>
        const merged = { ...existingGrid, ...(patchBody.grid as Record<string, unknown>) }
        sets.push('grid = ?')
        values.push(JSON.stringify(merged))
      }

      if (sets.length > 0) {
        values.push(sceneId)
        req
          .roomDb!.prepare(`UPDATE tactical_state SET ${sets.join(', ')} WHERE scene_id = ?`)
          .run(...values)
      }

      return getTacticalState(req.roomDb!, sceneId)
    })

    const updated = doPatch()
    if (updated) {
      io.to(req.roomId!).emit('tactical:updated', updated)
    }
    res.json(updated)
  })

  // POST /tactical/enter — set tactical_mode = 1 and broadcast current tactical state
  router.post('/api/rooms/:roomId/tactical/enter', room, (req, res) => {
    const sceneId = getActiveSceneId(req.roomDb!)
    if (!sceneId) {
      res.status(404).json({ error: 'No active scene' })
      return
    }
    req
      .roomDb!.prepare('UPDATE tactical_state SET tactical_mode = 1 WHERE scene_id = ?')
      .run(sceneId)
    const state = getTacticalState(req.roomDb!, sceneId)
    if (state) {
      io.to(req.roomId!).emit('tactical:updated', state)
    }
    res.json(state)
  })

  // POST /tactical/exit — set tactical_mode = 0
  router.post('/api/rooms/:roomId/tactical/exit', room, (req, res) => {
    const sceneId = getActiveSceneId(req.roomDb!)
    if (!sceneId) {
      res.status(404).json({ error: 'No active scene' })
      return
    }
    req
      .roomDb!.prepare('UPDATE tactical_state SET tactical_mode = 0 WHERE scene_id = ?')
      .run(sceneId)
    const state = getTacticalState(req.roomDb!, sceneId)
    if (state) {
      io.to(req.roomId!).emit('tactical:updated', state)
    }
    res.json(state)
  })

  // POST /tactical/clear — remove all tokens + reset map, stay in tactical mode
  router.post('/api/rooms/:roomId/tactical/clear', room, (req, res) => {
    const db = req.roomDb!
    const sceneId = getActiveSceneId(db)
    if (!sceneId) {
      res.status(404).json({ error: 'No active scene' })
      return
    }

    const doClear = db.transaction(() => {
      // Delete orphan ephemeral entities (tactical-only, not in any scene)
      const orphans = db
        .prepare(
          `SELECT e.id FROM entities e
           JOIN tactical_tokens t ON t.entity_id = e.id
           WHERE t.scene_id = ? AND e.lifecycle = 'ephemeral'
             AND NOT EXISTS (SELECT 1 FROM scene_entities se WHERE se.entity_id = e.id)`,
        )
        .all(sceneId) as { id: string }[]

      // Delete all tactical tokens for this scene
      db.prepare('DELETE FROM tactical_tokens WHERE scene_id = ?').run(sceneId)

      // Delete orphan entities (CASCADE handles entity_components + entity_tags)
      const deleteEntity = db.prepare('DELETE FROM entities WHERE id = ?')
      for (const { id } of orphans) {
        deleteEntity.run(id)
      }

      // Reset map fields (keep tactical_mode as-is)
      db.prepare(
        `UPDATE tactical_state
         SET map_url = NULL, map_width = NULL, map_height = NULL,
             round_number = 0, current_turn_token_id = NULL
         WHERE scene_id = ?`,
      ).run(sceneId)

      return orphans.map((o) => o.id)
    })
    const orphanIds = doClear()

    // Emit entity:deleted for orphans
    for (const id of orphanIds) {
      io.to(req.roomId!).emit('entity:deleted', { id })
    }

    // Emit updated tactical state
    const state = getTacticalState(db, sceneId)
    if (state) {
      io.to(req.roomId!).emit('tactical:updated', state)
    }
    res.json(state)
  })

  // POST /tactical/tokens — create token for existing entity
  router.post('/api/rooms/:roomId/tactical/tokens', room, (req, res) => {
    const {
      entityId,
      x = 0,
      y = 0,
      width = 1,
      height = 1,
      imageScaleX = 1,
      imageScaleY = 1,
    } = req.body as Record<string, unknown>

    if (!entityId) {
      res.status(400).json({ error: 'entityId is required' })
      return
    }

    const entity = req.roomDb!.prepare('SELECT id FROM entities WHERE id = ?').get(entityId)
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }

    const sceneId = getActiveSceneId(req.roomDb!)
    if (!sceneId) {
      res.status(404).json({ error: 'No active scene' })
      return
    }

    const id = crypto.randomUUID()
    try {
      req
        .roomDb!.prepare(
          `INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height, image_scale_x, image_scale_y)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, sceneId, entityId, x, y, width, height, imageScaleX, imageScaleY)
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(409).json({ error: 'Entity already has a token in this scene' })
        return
      }
      throw err
    }

    const row = req.roomDb!.prepare('SELECT * FROM tactical_tokens WHERE id = ?').get(id) as Record<
      string,
      unknown
    >
    const token = toToken(row)
    io.to(req.roomId!).emit('tactical:token:added', token)
    res.status(201).json(token)
  })

  // POST /tactical/tokens/quick — atomic create: ephemeral entity + token
  router.post('/api/rooms/:roomId/tactical/tokens/quick', room, (req, res) => {
    const {
      x = 0,
      y = 0,
      name = '',
      color = '#888888',
      width = 1,
      height = 1,
      imageUrl = '',
    } = req.body as Record<string, unknown>

    const sceneId = getActiveSceneId(req.roomDb!)
    if (!sceneId) {
      res.status(404).json({ error: 'No active scene' })
      return
    }

    const db = req.roomDb!
    const entityId = 'e-' + crypto.randomUUID().slice(0, 8)
    const tokenId = crypto.randomUUID()

    const createQuick = db.transaction(() => {
      // Insert slim entity
      db.prepare(
        `INSERT INTO entities (id, permissions, lifecycle)
         VALUES (?, '{"default":"observer","seats":{}}', 'ephemeral')`,
      ).run(entityId)

      // Insert components
      const insertComp = db.prepare(
        'INSERT INTO entity_components (entity_id, component_key, data) VALUES (?, ?, ?)',
      )
      insertComp.run(
        entityId,
        'core:identity',
        JSON.stringify({ name, imageUrl }),
      )
      insertComp.run(
        entityId,
        'core:appearance',
        JSON.stringify({ color, width, height }),
      )

      db.prepare(
        `INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(tokenId, sceneId, entityId, x, y, width, height)
    })
    createQuick()

    const entity = loadEntity(db, entityId)!
    const tokenRow = db
      .prepare('SELECT * FROM tactical_tokens WHERE id = ?')
      .get(tokenId) as Record<string, unknown>
    const token = toToken(tokenRow)

    io.to(req.roomId!).emit('tactical:token:added', token)
    io.to(req.roomId!).emit('entity:created', entity)
    res.status(201).json({ entity, token })
  })

  // POST /tactical/tokens/from-entity — place existing entity on map (1:1 check)
  router.post('/api/rooms/:roomId/tactical/tokens/from-entity', room, (req, res) => {
    const { entityId, x = 0, y = 0, width, height } = req.body as Record<string, unknown>

    if (!entityId) {
      res.status(400).json({ error: 'entityId is required' })
      return
    }

    const entityExists = req
      .roomDb!.prepare('SELECT id FROM entities WHERE id = ?')
      .get(entityId)
    if (!entityExists) {
      res.status(404).json({ error: 'Entity not found' })
      return
    }

    const sceneId = getActiveSceneId(req.roomDb!)
    if (!sceneId) {
      res.status(404).json({ error: 'No active scene' })
      return
    }

    // 1:1 check: entity must not already have a token in this scene
    const existing = req
      .roomDb!.prepare('SELECT id FROM tactical_tokens WHERE scene_id = ? AND entity_id = ?')
      .get(sceneId, entityId)
    if (existing) {
      res.status(409).json({ error: 'Entity already has a token in this scene' })
      return
    }

    // Get width/height from core:appearance component if not provided
    let tokenWidth = width
    let tokenHeight = height
    if (tokenWidth === undefined || tokenHeight === undefined) {
      const appearance = req.roomDb!
        .prepare(
          "SELECT data FROM entity_components WHERE entity_id = ? AND component_key = 'core:appearance'",
        )
        .get(entityId) as { data: string } | undefined
      if (appearance) {
        const appData = JSON.parse(appearance.data) as Record<string, unknown>
        if (tokenWidth === undefined) tokenWidth = appData.width ?? 1
        if (tokenHeight === undefined) tokenHeight = appData.height ?? 1
      } else {
        if (tokenWidth === undefined) tokenWidth = 1
        if (tokenHeight === undefined) tokenHeight = 1
      }
    }

    const id = crypto.randomUUID()

    try {
      req
        .roomDb!.prepare(
          `INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, sceneId, entityId, x, y, tokenWidth, tokenHeight)
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(409).json({ error: 'Entity already has a token in this scene' })
        return
      }
      throw err
    }

    const row = req.roomDb!.prepare('SELECT * FROM tactical_tokens WHERE id = ?').get(id) as Record<
      string,
      unknown
    >
    const token = toToken(row)
    io.to(req.roomId!).emit('tactical:token:added', token)
    res.status(201).json(token)
  })

  // POST /tactical/tokens/:tokenId/duplicate — copy entity + token
  router.post('/api/rooms/:roomId/tactical/tokens/:tokenId/duplicate', room, (req, res) => {
    const { offsetX = 1, offsetY = 1 } = req.body as { offsetX?: number; offsetY?: number }
    const db = req.roomDb!

    const tokenRow = db
      .prepare('SELECT * FROM tactical_tokens WHERE id = ?')
      .get(req.params.tokenId) as Record<string, unknown> | undefined
    if (!tokenRow) {
      res.status(404).json({ error: 'Token not found' })
      return
    }

    const sourceEntityId = tokenRow.entity_id as string
    const entityRow = db
      .prepare('SELECT * FROM entities WHERE id = ?')
      .get(sourceEntityId) as Record<string, unknown> | undefined
    if (!entityRow) {
      res.status(404).json({ error: 'Source entity not found' })
      return
    }

    const newEntityId = 'e-' + crypto.randomUUID().slice(0, 8)
    const newTokenId = crypto.randomUUID()

    const duplicate = db.transaction(() => {
      // Insert slim entity copy
      db.prepare(
        `INSERT INTO entities (id, permissions, lifecycle)
         VALUES (?, ?, 'ephemeral')`,
      ).run(newEntityId, entityRow.permissions)

      // Copy all components from source entity
      const componentRows = db
        .prepare('SELECT component_key, data FROM entity_components WHERE entity_id = ?')
        .all(sourceEntityId) as { component_key: string; data: string }[]
      const insertComp = db.prepare(
        'INSERT INTO entity_components (entity_id, component_key, data) VALUES (?, ?, ?)',
      )
      for (const comp of componentRows) {
        insertComp.run(newEntityId, comp.component_key, comp.data)
      }

      // Copy tags from source entity
      const tagRows = db
        .prepare(
          'SELECT t.name FROM tags t JOIN entity_tags et ON t.id = et.tag_id WHERE et.entity_id = ?',
        )
        .all(sourceEntityId) as { name: string }[]
      if (tagRows.length > 0) {
        // Use direct insert to avoid re-creating tags
        const findTag = db.prepare('SELECT id FROM tags WHERE name = ?')
        const insertTag = db.prepare(
          'INSERT INTO entity_tags (entity_id, tag_id) VALUES (?, ?)',
        )
        for (const { name } of tagRows) {
          const tag = findTag.get(name) as { id: string }
          insertTag.run(newEntityId, tag.id)
        }
      }

      db.prepare(
        `INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height, image_scale_x, image_scale_y)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newTokenId,
        tokenRow.scene_id,
        newEntityId,
        (tokenRow.x as number) + offsetX,
        (tokenRow.y as number) + offsetY,
        tokenRow.width,
        tokenRow.height,
        tokenRow.image_scale_x,
        tokenRow.image_scale_y,
      )
    })
    duplicate()

    const entity = loadEntity(db, newEntityId)!
    const newTokenRow = db
      .prepare('SELECT * FROM tactical_tokens WHERE id = ?')
      .get(newTokenId) as Record<string, unknown>
    const token = toToken(newTokenRow)

    io.to(req.roomId!).emit('tactical:token:added', token)
    io.to(req.roomId!).emit('entity:created', entity)
    res.status(201).json({ entity, token })
  })

  // PATCH /tactical/tokens/:tokenId — update single token row
  router.patch('/api/rooms/:roomId/tactical/tokens/:tokenId', room, (req, res) => {
    const existing = req
      .roomDb!.prepare('SELECT id FROM tactical_tokens WHERE id = ?')
      .get(req.params.tokenId)
    if (!existing) {
      res.status(404).json({ error: 'Token not found' })
      return
    }

    const tokenPatchBody = req.body as Record<string, unknown>
    const sets: string[] = []
    const values: unknown[] = []

    const fields: Record<string, string> = {
      x: 'x',
      y: 'y',
      width: 'width',
      height: 'height',
      imageScaleX: 'image_scale_x',
      imageScaleY: 'image_scale_y',
      initiativePosition: 'initiative_position',
    }
    for (const [camel, snake] of Object.entries(fields)) {
      if (tokenPatchBody[camel] !== undefined) {
        sets.push(`${snake} = ?`)
        values.push(tokenPatchBody[camel])
      }
    }

    if (sets.length > 0) {
      values.push(req.params.tokenId)
      req
        .roomDb!.prepare(`UPDATE tactical_tokens SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values)
    }

    const row = req
      .roomDb!.prepare('SELECT * FROM tactical_tokens WHERE id = ?')
      .get(req.params.tokenId) as Record<string, unknown>
    const token = toToken(row)
    io.to(req.roomId!).emit('tactical:token:updated', token)
    res.json(token)
  })

  // DELETE /tactical/tokens/:tokenId — delete single token row
  router.delete('/api/rooms/:roomId/tactical/tokens/:tokenId', room, (req, res) => {
    const existing = req
      .roomDb!.prepare('SELECT id FROM tactical_tokens WHERE id = ?')
      .get(req.params.tokenId)
    if (!existing) {
      res.status(404).json({ error: 'Token not found' })
      return
    }
    req.roomDb!.prepare('DELETE FROM tactical_tokens WHERE id = ?').run(req.params.tokenId)
    io.to(req.roomId!).emit('tactical:token:removed', { id: req.params.tokenId as string })
    res.json({ id: req.params.tokenId })
  })

  return router
}
