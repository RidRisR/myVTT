// server/routes/tactical.ts — Tactical (combat) state API (per-scene)
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import type Database from 'better-sqlite3'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields } from '../db'

function toToken(row: Record<string, unknown>) {
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
  }
}

function toEntity(row: Record<string, unknown>) {
  return parseJsonFields(toCamel(row), 'ruleData', 'permissions')
}

function getTacticalState(db: Database.Database, sceneId: string) {
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
  }
}

function getActiveSceneId(db: Database.Database): string | null {
  const roomState = db.prepare('SELECT active_scene_id FROM room_state WHERE id = 1').get() as {
    active_scene_id: string | null
  }
  return roomState.active_scene_id
}

function getRoomState(db: Database.Database) {
  const row = db.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<string, unknown>
  return toCamel(row)
}

export function tacticalRoutes(dataDir: string, io: Server): Router {
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
    io.to(req.roomId!).emit('tactical:updated', updated)
    res.json(updated)
  })

  // POST /tactical/enter — set tactical_mode = 1 and broadcast current tactical state
  router.post('/api/rooms/:roomId/tactical/enter', room, (req, res) => {
    req.roomDb!.prepare('UPDATE room_state SET tactical_mode = 1 WHERE id = 1').run()
    const state = getRoomState(req.roomDb!)
    io.to(req.roomId!).emit('room:state:updated', state)
    // Also broadcast tactical:activated so clients populate tacticalInfo from the store.
    // This matches the archive load flow and ensures that token operations (which gate on
    // tacticalInfo !== null) work correctly immediately after entering tactical mode.
    const sceneId = getActiveSceneId(req.roomDb!)
    if (sceneId) {
      const tacticalState = getTacticalState(req.roomDb!, sceneId)
      if (tacticalState) {
        io.to(req.roomId!).emit('tactical:activated', tacticalState)
      }
    }
    res.json(state)
  })

  // POST /tactical/exit — set tactical_mode = 0
  router.post('/api/rooms/:roomId/tactical/exit', room, (req, res) => {
    req.roomDb!.prepare('UPDATE room_state SET tactical_mode = 0 WHERE id = 1').run()
    const state = getRoomState(req.roomDb!)
    io.to(req.roomId!).emit('room:state:updated', state)
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

    const entityId = 'e-' + crypto.randomUUID().slice(0, 8)
    const tokenId = crypto.randomUUID()

    const createQuick = req.roomDb!.transaction(() => {
      req
        .roomDb!.prepare(
          `INSERT INTO entities (id, name, image_url, color, width, height, lifecycle)
           VALUES (?, ?, ?, ?, ?, ?, 'ephemeral')`,
        )
        .run(entityId, name, imageUrl, color, width, height)

      req
        .roomDb!.prepare(
          `INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(tokenId, sceneId, entityId, x, y, width, height)
    })
    createQuick()

    const entityRow = req
      .roomDb!.prepare('SELECT * FROM entities WHERE id = ?')
      .get(entityId) as Record<string, unknown>
    const tokenRow = req
      .roomDb!.prepare('SELECT * FROM tactical_tokens WHERE id = ?')
      .get(tokenId) as Record<string, unknown>
    const entity = toEntity(entityRow)
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

    const entity = req
      .roomDb!.prepare('SELECT id, width, height FROM entities WHERE id = ?')
      .get(entityId) as { id: string; width: number; height: number } | undefined
    if (!entity) {
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

    const id = crypto.randomUUID()
    const tokenWidth = width ?? entity.width
    const tokenHeight = height ?? entity.height

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

    const tokenRow = req
      .roomDb!.prepare('SELECT * FROM tactical_tokens WHERE id = ?')
      .get(req.params.tokenId) as Record<string, unknown> | undefined
    if (!tokenRow) {
      res.status(404).json({ error: 'Token not found' })
      return
    }

    const entityRow = req
      .roomDb!.prepare('SELECT * FROM entities WHERE id = ?')
      .get(tokenRow.entity_id) as Record<string, unknown> | undefined
    if (!entityRow) {
      res.status(404).json({ error: 'Source entity not found' })
      return
    }

    const newEntityId = 'e-' + crypto.randomUUID().slice(0, 8)
    const newTokenId = crypto.randomUUID()

    const duplicate = req.roomDb!.transaction(() => {
      req
        .roomDb!.prepare(
          `INSERT INTO entities (id, name, image_url, color, width, height, notes, rule_data, permissions, lifecycle)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ephemeral')`,
        )
        .run(
          newEntityId,
          entityRow.name,
          entityRow.image_url,
          entityRow.color,
          entityRow.width,
          entityRow.height,
          entityRow.notes,
          entityRow.rule_data,
          entityRow.permissions,
        )

      req
        .roomDb!.prepare(
          `INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height, image_scale_x, image_scale_y)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
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

    const newEntityRow = req
      .roomDb!.prepare('SELECT * FROM entities WHERE id = ?')
      .get(newEntityId) as Record<string, unknown>
    const newTokenRow = req
      .roomDb!.prepare('SELECT * FROM tactical_tokens WHERE id = ?')
      .get(newTokenId) as Record<string, unknown>
    const entity = toEntity(newEntityRow)
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
    io.to(req.roomId!).emit('tactical:token:removed', { id: req.params.tokenId })
    res.json({ id: req.params.tokenId })
  })

  return router
}
