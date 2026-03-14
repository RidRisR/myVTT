// server/routes/encounters.ts — Encounter CRUD + activation
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom, withRole } from '../middleware'
import { toCamel, parseJsonFields, toBoolFields } from '../db'

export function encounterRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function toEncounter(row: Record<string, unknown>) {
    const r = parseJsonFields(toCamel<Record<string, unknown>>(row), 'grid', 'tokens')
    return toBoolFields(r, 'gmOnly')
  }

  router.get('/api/rooms/:roomId/scenes/:sceneId/encounters', room, withRole, (req, res) => {
    const where = req.role === 'GM' ? 'WHERE scene_id = ?' : 'WHERE scene_id = ? AND gm_only = 0'
    const rows = req
      .roomDb!.prepare(`SELECT * FROM encounters ${where}`)
      .all(req.params.sceneId) as Record<string, unknown>[]
    res.json(rows.map(toEncounter))
  })

  router.post('/api/rooms/:roomId/scenes/:sceneId/encounters', room, (req, res) => {
    const id = crypto.randomUUID()
    const { name, mapUrl, mapWidth, mapHeight, grid, tokens, gmOnly } = req.body
    req
      .roomDb!.prepare(
        `INSERT INTO encounters (id, scene_id, name, map_url, map_width, map_height, grid, tokens, gm_only)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        req.params.sceneId,
        name || 'Encounter',
        mapUrl || null,
        mapWidth || null,
        mapHeight || null,
        JSON.stringify(grid || {}),
        JSON.stringify(tokens || {}),
        gmOnly ? 1 : 0,
      )
    const encounter = toEncounter(
      req.roomDb!.prepare('SELECT * FROM encounters WHERE id = ?').get(id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('encounter:created', encounter)
    res.status(201).json(encounter)
  })

  router.patch('/api/rooms/:roomId/encounters/:id', room, (req, res) => {
    const existing = req
      .roomDb!.prepare('SELECT id FROM encounters WHERE id = ?')
      .get(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Encounter not found' })
      return
    }

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
      if (req.body[camel] !== undefined) {
        sets.push(`${snake} = ?`)
        values.push(camel === 'gmOnly' ? (req.body[camel] ? 1 : 0) : req.body[camel])
      }
    }
    for (const key of ['grid', 'tokens'] as const) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`)
        values.push(JSON.stringify(req.body[key]))
      }
    }
    if (sets.length > 0) {
      values.push(req.params.id)
      req.roomDb!.prepare(`UPDATE encounters SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = toEncounter(
      req.roomDb!.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('encounter:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/encounters/:id', room, (req, res) => {
    const deleteEnc = req.roomDb!.transaction(() => {
      // Clear dangling room_state reference
      req
        .roomDb!.prepare(
          'UPDATE room_state SET active_encounter_id = NULL WHERE id = 1 AND active_encounter_id = ?',
        )
        .run(req.params.id)
      req.roomDb!.prepare('DELETE FROM encounters WHERE id = ?').run(req.params.id)
    })
    deleteEnc()
    io.to(req.roomId!).emit('encounter:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  // Activate encounter → expand into combat_state
  router.post('/api/rooms/:roomId/encounters/:id/activate', room, (req, res) => {
    const encounter = req
      .roomDb!.prepare('SELECT * FROM encounters WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined
    if (!encounter) {
      res.status(404).json({ error: 'Encounter not found' })
      return
    }

    req
      .roomDb!.prepare('UPDATE room_state SET active_encounter_id = ? WHERE id = 1')
      .run(req.params.id)
    req
      .roomDb!.prepare(
        `UPDATE combat_state SET
          map_url = ?, map_width = ?, map_height = ?,
          grid = ?, tokens = ?,
          initiative_order = '[]', initiative_index = 0
        WHERE id = 1`,
      )
      .run(
        encounter.map_url,
        encounter.map_width,
        encounter.map_height,
        encounter.grid,
        encounter.tokens,
      )

    const combatRow = req
      .roomDb!.prepare('SELECT * FROM combat_state WHERE id = 1')
      .get() as Record<string, unknown>
    const combatState = parseJsonFields(
      toCamel<Record<string, unknown>>(combatRow),
      'grid',
      'tokens',
      'initiativeOrder',
    )

    io.to(req.roomId!).emit('combat:activated', combatState)
    io.to(req.roomId!).emit('room:state:updated', { activeEncounterId: req.params.id })
    res.json(combatState)
  })

  // Save current combat state back to encounter (snapshot)
  router.post('/api/rooms/:roomId/encounters/:id/save-snapshot', room, (req, res) => {
    const combatRow = req
      .roomDb!.prepare('SELECT * FROM combat_state WHERE id = 1')
      .get() as Record<string, unknown>

    req
      .roomDb!.prepare(
        `UPDATE encounters SET
          map_url = ?, map_width = ?, map_height = ?,
          grid = ?, tokens = ?
        WHERE id = ?`,
      )
      .run(
        combatRow.map_url,
        combatRow.map_width,
        combatRow.map_height,
        combatRow.grid,
        combatRow.tokens,
        req.params.id,
      )

    res.json({ ok: true })
  })

  return router
}
