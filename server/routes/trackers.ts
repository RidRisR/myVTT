// server/routes/trackers.ts — Team trackers CRUD
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'
import { toCamel, toCamelAll } from '../db'

export function trackerRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/team-trackers', room, (req, res) => {
    const rows = req.roomDb!
      .prepare('SELECT * FROM team_trackers ORDER BY sort_order')
      .all() as Record<string, unknown>[]
    res.json(toCamelAll(rows))
  })

  router.post('/api/rooms/:roomId/team-trackers', room, (req, res) => {
    const id = crypto.randomUUID()
    const { label = '', current = 0, max = 0, color = '#3b82f6', sortOrder } = req.body
    const count = (
      req.roomDb!.prepare('SELECT COUNT(*) as c FROM team_trackers').get() as { c: number }
    ).c
    req.roomDb!
      .prepare(
        'INSERT INTO team_trackers (id, label, current, max, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, label, current, max, color, sortOrder ?? count)

    const tracker = toCamel(
      req.roomDb!.prepare('SELECT * FROM team_trackers WHERE id = ?').get(id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('tracker:created', tracker)
    res.status(201).json(tracker)
  })

  router.patch('/api/rooms/:roomId/team-trackers/:id', room, (req, res) => {
    const existing = req.roomDb!
      .prepare('SELECT id FROM team_trackers WHERE id = ?')
      .get(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Tracker not found' })
      return
    }

    const fieldMap: Record<string, string> = {
      label: 'label',
      current: 'current',
      max: 'max',
      color: 'color',
      sortOrder: 'sort_order',
    }
    const sets: string[] = []
    const values: unknown[] = []
    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (req.body[camel] !== undefined) {
        sets.push(`${snake} = ?`)
        values.push(req.body[camel])
      }
    }
    if (sets.length > 0) {
      values.push(req.params.id)
      req.roomDb!
        .prepare(`UPDATE team_trackers SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values)
    }

    const updated = toCamel(
      req.roomDb!
        .prepare('SELECT * FROM team_trackers WHERE id = ?')
        .get(req.params.id) as Record<string, unknown>,
    )
    io.to(req.roomId!).emit('tracker:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/team-trackers/:id', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM team_trackers WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('tracker:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  return router
}
