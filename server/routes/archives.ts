// server/routes/archives.ts — Archive CRUD (replaces encounters)
import { Router } from 'express'
import crypto from 'crypto'
import type { TypedServer } from '../socketTypes'
import type { ArchiveRecord } from '../../src/shared/storeTypes'
import { withRoom, withRole } from '../middleware'
import { toCamel, parseJsonFields, toBoolFields } from '../db'
import { getTacticalState } from './tactical'
import { loadEntity } from './entities'

function toArchive(row: Record<string, unknown>): ArchiveRecord {
  const r = parseJsonFields(toCamel(row), 'grid')
  return toBoolFields(r, 'gmOnly') as unknown as ArchiveRecord
}

export function archiveRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  // GET /scenes/:sceneId/archives — list archives for scene
  router.get('/api/rooms/:roomId/scenes/:sceneId/archives', room, withRole, (req, res) => {
    const where = req.role === 'GM' ? 'WHERE scene_id = ?' : 'WHERE scene_id = ? AND gm_only = 0'
    const rows = req
      .roomDb!.prepare(`SELECT * FROM archives ${where}`)
      .all(req.params.sceneId) as Record<string, unknown>[]
    res.json(rows.map(toArchive))
  })

  // POST /scenes/:sceneId/archives — create archive
  router.post('/api/rooms/:roomId/scenes/:sceneId/archives', room, (req, res) => {
    const id = crypto.randomUUID()
    const body = req.body as Record<string, unknown>
    const { name, mapUrl, mapWidth, mapHeight, grid, gmOnly } = body
    req
      .roomDb!.prepare(
        `INSERT INTO archives (id, scene_id, name, map_url, map_width, map_height, grid, gm_only)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        req.params.sceneId,
        name || 'Archive',
        mapUrl || null,
        mapWidth || null,
        mapHeight || null,
        JSON.stringify(grid || {}),
        gmOnly ? 1 : 0,
      )
    const archive = toArchive(
      req.roomDb!.prepare('SELECT * FROM archives WHERE id = ?').get(id) as Record<string, unknown>,
    )
    io.to(req.roomId!).emit('archive:created', archive)
    res.status(201).json(archive)
  })

  // PATCH /archives/:archiveId — update archive fields
  router.patch('/api/rooms/:roomId/archives/:archiveId', room, (req, res) => {
    const existing = req
      .roomDb!.prepare('SELECT id FROM archives WHERE id = ?')
      .get(req.params.archiveId)
    if (!existing) {
      res.status(404).json({ error: 'Archive not found' })
      return
    }

    const body = req.body as Record<string, unknown>
    const sets: string[] = []
    const values: unknown[] = []
    const simpleFields: Record<string, string> = {
      name: 'name',
      mapUrl: 'map_url',
      mapWidth: 'map_width',
      mapHeight: 'map_height',
      gmOnly: 'gm_only',
    }
    for (const [camel, snake] of Object.entries(simpleFields)) {
      if (body[camel] !== undefined) {
        sets.push(`${snake} = ?`)
        values.push(camel === 'gmOnly' ? (body[camel] ? 1 : 0) : body[camel])
      }
    }
    if (body.grid !== undefined) {
      sets.push('grid = ?')
      values.push(JSON.stringify(body.grid))
    }
    if (sets.length > 0) {
      values.push(req.params.archiveId)
      req.roomDb!.prepare(`UPDATE archives SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = toArchive(
      req
        .roomDb!.prepare('SELECT * FROM archives WHERE id = ?')
        .get(req.params.archiveId) as Record<string, unknown>,
    )
    io.to(req.roomId!).emit('archive:updated', updated)
    res.json(updated)
  })

  // DELETE /archives/:archiveId — delete archive (CASCADE handles archive_tokens)
  router.delete('/api/rooms/:roomId/archives/:archiveId', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM archives WHERE id = ?').run(req.params.archiveId)
    io.to(req.roomId!).emit('archive:deleted', { id: req.params.archiveId as string })
    res.json({ ok: true })
  })

  // POST /archives/:archiveId/save — snapshot current tactical state into archive
  router.post('/api/rooms/:roomId/archives/:archiveId/save', room, (req, res) => {
    const db = req.roomDb!
    const archiveId = req.params.archiveId

    // 1. Get active scene
    const roomState = db.prepare('SELECT active_scene_id FROM room_state WHERE id = 1').get() as {
      active_scene_id: string | null
    }
    const sceneId = roomState.active_scene_id
    if (!sceneId) {
      res.status(404).json({ error: 'No active scene' })
      return
    }

    // 2. Check archive exists
    const archive = db.prepare('SELECT id FROM archives WHERE id = ?').get(archiveId)
    if (!archive) {
      res.status(404).json({ error: 'Archive not found' })
      return
    }

    // 3. Get current tactical state (map settings)
    const tacticalState = db
      .prepare(
        'SELECT map_url, map_width, map_height, grid, round_number, current_turn_token_id FROM tactical_state WHERE scene_id = ?',
      )
      .get(sceneId) as
      | {
          map_url: string | null
          map_width: number | null
          map_height: number | null
          grid: string
          round_number: number
          current_turn_token_id: string | null
        }
      | undefined

    // 4. Get tokens joined with entities + their components
    const tokenRows = db
      .prepare(
        `SELECT t.id, t.x, t.y, t.width, t.height, t.image_scale_x, t.image_scale_y,
                e.id as entity_id, e.permissions, e.lifecycle
         FROM tactical_tokens t
         JOIN entities e ON t.entity_id = e.id
         WHERE t.scene_id = ?`,
      )
      .all(sceneId) as Record<string, unknown>[]

    // 5. Transaction: delete old archive_tokens, insert new ones, update archive map settings
    const doSave = db.transaction(() => {
      // Delete existing archive tokens
      db.prepare('DELETE FROM archive_tokens WHERE archive_id = ?').run(archiveId)

      // Insert archive tokens
      const insertStmt = db.prepare(
        `INSERT INTO archive_tokens (id, archive_id, x, y, width, height, image_scale_x, image_scale_y, snapshot_lifecycle, original_entity_id, snapshot_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )

      for (const row of tokenRows) {
        const tokenId = crypto.randomUUID()
        const lifecycle = row.lifecycle as string
        const entityId = row.entity_id as string

        if (lifecycle === 'ephemeral') {
          // Snapshot: store components + permissions, no reference
          const componentRows = db
            .prepare('SELECT component_key, data FROM entity_components WHERE entity_id = ?')
            .all(entityId) as { component_key: string; data: string }[]
          const components: Record<string, unknown> = {}
          for (const cr of componentRows) {
            components[cr.component_key] = JSON.parse(cr.data)
          }
          const snapshotData = JSON.stringify({
            components,
            permissions: row.permissions,
          })
          insertStmt.run(
            tokenId,
            archiveId,
            row.x,
            row.y,
            row.width,
            row.height,
            row.image_scale_x,
            row.image_scale_y,
            'ephemeral',
            null,
            snapshotData,
          )
        } else {
          // Reusable/persistent: store reference
          insertStmt.run(
            tokenId,
            archiveId,
            row.x,
            row.y,
            row.width,
            row.height,
            row.image_scale_x,
            row.image_scale_y,
            lifecycle,
            entityId,
            null,
          )
        }
      }

      // Update archive map settings from tactical_state
      if (tacticalState) {
        db.prepare(
          'UPDATE archives SET map_url = ?, map_width = ?, map_height = ?, grid = ?, round_number = ?, current_turn_token_id = ? WHERE id = ?',
        ).run(
          tacticalState.map_url,
          tacticalState.map_width,
          tacticalState.map_height,
          tacticalState.grid,
          tacticalState.round_number,
          tacticalState.current_turn_token_id,
          archiveId,
        )
      }
    })
    doSave()

    // Return updated archive
    const updated = toArchive(
      db.prepare('SELECT * FROM archives WHERE id = ?').get(archiveId) as Record<string, unknown>,
    )
    io.to(req.roomId!).emit('archive:updated', updated)
    res.json(updated)
  })

  // POST /archives/:archiveId/load — restore tactical state from archive
  router.post('/api/rooms/:roomId/archives/:archiveId/load', room, (req, res) => {
    const db = req.roomDb!
    const archiveId = req.params.archiveId

    // 1. Get active scene
    const roomState = db.prepare('SELECT active_scene_id FROM room_state WHERE id = 1').get() as {
      active_scene_id: string | null
    }
    const sceneId = roomState.active_scene_id
    if (!sceneId) {
      res.status(404).json({ error: 'No active scene' })
      return
    }

    // 2. Check archive exists
    const archiveRow = db.prepare('SELECT * FROM archives WHERE id = ?').get(archiveId) as
      | Record<string, unknown>
      | undefined
    if (!archiveRow) {
      res.status(404).json({ error: 'Archive not found' })
      return
    }

    // 3. Get archive tokens
    const archiveTokens = db
      .prepare('SELECT * FROM archive_tokens WHERE archive_id = ?')
      .all(archiveId) as Record<string, unknown>[]

    // 4. Collect orphan IDs before transaction (for post-transaction entity:deleted events)
    const orphanEphemerals = db
      .prepare(
        `SELECT e.id FROM entities e
         JOIN tactical_tokens t ON t.entity_id = e.id
         WHERE t.scene_id = ? AND e.lifecycle = 'ephemeral'
           AND NOT EXISTS (SELECT 1 FROM scene_entities se WHERE se.entity_id = e.id)`,
      )
      .all(sceneId) as { id: string }[]
    const orphanIds = orphanEphemerals.map((o) => o.id)

    const newEntityIds: string[] = []

    // 5. Transaction: clear current tokens, restore from archive
    const doLoad = db.transaction(() => {
      // a. Delete all tactical_tokens for current scene
      db.prepare('DELETE FROM tactical_tokens WHERE scene_id = ?').run(sceneId)

      // b. Delete orphan ephemeral entities (CASCADE handles entity_components + entity_tags)
      const deleteEntityStmt = db.prepare('DELETE FROM entities WHERE id = ?')
      for (const id of orphanIds) {
        deleteEntityStmt.run(id)
      }

      // c. For each archive_token, recreate entity (if ephemeral) and token
      const insertTokenStmt = db.prepare(
        `INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height, image_scale_x, image_scale_y)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      const insertEntityStmt = db.prepare(
        `INSERT INTO entities (id, permissions, lifecycle)
         VALUES (?, ?, 'ephemeral')`,
      )
      const insertCompStmt = db.prepare(
        'INSERT INTO entity_components (entity_id, component_key, data) VALUES (?, ?, ?)',
      )

      for (const at of archiveTokens) {
        const lifecycle = at.snapshot_lifecycle as string
        const tokenId = crypto.randomUUID()

        if (lifecycle === 'ephemeral') {
          // Create new entity from snapshot_data
          let snap: Record<string, unknown>
          try {
            snap = JSON.parse(at.snapshot_data as string) as Record<string, unknown>
          } catch {
            continue // skip corrupted snapshot
          }
          const entityId = 'e-' + crypto.randomUUID().slice(0, 8)
          newEntityIds.push(entityId)

          const permissions =
            typeof snap.permissions === 'string'
              ? snap.permissions
              : JSON.stringify(snap.permissions || { default: 'observer', seats: {} })

          insertEntityStmt.run(entityId, permissions)

          // Restore components
          const components = (snap.components || {}) as Record<string, unknown>
          for (const [key, data] of Object.entries(components)) {
            insertCompStmt.run(entityId, key, JSON.stringify(data))
          }

          insertTokenStmt.run(
            tokenId,
            sceneId,
            entityId,
            at.x,
            at.y,
            at.width,
            at.height,
            at.image_scale_x,
            at.image_scale_y,
          )
        } else {
          // Reusable/persistent: check original entity still exists
          const originalEntity = db
            .prepare('SELECT id FROM entities WHERE id = ?')
            .get(at.original_entity_id)
          if (originalEntity) {
            insertTokenStmt.run(
              tokenId,
              sceneId,
              at.original_entity_id,
              at.x,
              at.y,
              at.width,
              at.height,
              at.image_scale_x,
              at.image_scale_y,
            )
          }
          // If entity was deleted, skip this token
        }
      }

      // d. Update tactical_state from archive (map + round state)
      db.prepare(
        'UPDATE tactical_state SET map_url = ?, map_width = ?, map_height = ?, grid = ?, round_number = ?, current_turn_token_id = ? WHERE scene_id = ?',
      ).run(
        archiveRow.map_url,
        archiveRow.map_width,
        archiveRow.map_height,
        archiveRow.grid,
        archiveRow.round_number,
        archiveRow.current_turn_token_id,
        sceneId,
      )
    })
    doLoad()

    // 6. Emit entity sync events for other clients
    for (const id of orphanIds) {
      io.to(req.roomId!).emit('entity:deleted', { id })
    }
    for (const id of newEntityIds) {
      const entity = loadEntity(db, id)
      if (entity) {
        io.to(req.roomId!).emit('entity:created', entity)
      }
    }

    // 7. Emit tactical:updated with restored state
    const result = getTacticalState(db, sceneId)
    if (result) {
      io.to(req.roomId!).emit('tactical:updated', result)
    }
    res.json(result)
  })

  return router
}
