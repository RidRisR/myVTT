// server/routes/archives.ts — Archive CRUD (replaces encounters)
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom, withRole } from '../middleware'
import { toCamel, parseJsonFields, toBoolFields } from '../db'

function toArchive(row: Record<string, unknown>) {
  const r = parseJsonFields(toCamel<Record<string, unknown>>(row), 'grid')
  return toBoolFields(r, 'gmOnly')
}

export function archiveRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  // GET /scenes/:sceneId/archives — list archives for scene
  router.get('/api/rooms/:roomId/scenes/:sceneId/archives', room, withRole, (req, res) => {
    const where =
      req.role === 'GM' ? 'WHERE scene_id = ?' : 'WHERE scene_id = ? AND gm_only = 0'
    const rows = req
      .roomDb!.prepare(`SELECT * FROM archives ${where}`)
      .all(req.params.sceneId) as Record<string, unknown>[]
    res.json(rows.map(toArchive))
  })

  // POST /scenes/:sceneId/archives — create archive
  router.post('/api/rooms/:roomId/scenes/:sceneId/archives', room, (req, res) => {
    const id = crypto.randomUUID()
    const { name, mapUrl, mapWidth, mapHeight, grid, gmOnly } = req.body
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
      req.roomDb!.prepare('SELECT * FROM archives WHERE id = ?').get(id) as Record<
        string,
        unknown
      >,
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
    if (req.body.grid !== undefined) {
      sets.push('grid = ?')
      values.push(JSON.stringify(req.body.grid))
    }
    if (sets.length > 0) {
      values.push(req.params.archiveId)
      req
        .roomDb!.prepare(`UPDATE archives SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values)
    }

    const updated = toArchive(
      req.roomDb!.prepare('SELECT * FROM archives WHERE id = ?').get(req.params.archiveId) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('archive:updated', updated)
    res.json(updated)
  })

  // DELETE /archives/:archiveId — delete archive (CASCADE handles archive_tokens)
  router.delete('/api/rooms/:roomId/archives/:archiveId', room, (req, res) => {
    const deleteArchive = req.roomDb!.transaction(() => {
      // Clear dangling room_state reference
      req
        .roomDb!.prepare(
          'UPDATE room_state SET active_archive_id = NULL WHERE id = 1 AND active_archive_id = ?',
        )
        .run(req.params.archiveId)
      req.roomDb!.prepare('DELETE FROM archives WHERE id = ?').run(req.params.archiveId)
    })
    deleteArchive()
    io.to(req.roomId!).emit('archive:deleted', { id: req.params.archiveId })
    res.json({ ok: true })
  })

  // POST /archives/:archiveId/load — STUB: return 501 for now
  router.post('/api/rooms/:roomId/archives/:archiveId/load', room, (_req, res) => {
    res.status(501).json({ error: 'Not implemented — will be added in PR B' })
  })

  // POST /archives/:archiveId/save — STUB: return 501 for now
  router.post('/api/rooms/:roomId/archives/:archiveId/save', room, (_req, res) => {
    res.status(501).json({ error: 'Not implemented — will be added in PR B' })
  })

  return router
}
