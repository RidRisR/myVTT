// server/routes/seats.ts — Seat CRUD with WS broadcast
import { Router } from 'express'
import crypto from 'crypto'
import type { TypedServer } from '../socketTypes'
import type { Seat } from '../../src/shared/storeTypes'
import { withRoom } from '../middleware'
import { toCamel, toCamelAll } from '../db'

export function seatRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/seats', room, (req, res) => {
    const rows = req.roomDb!.prepare('SELECT * FROM seats ORDER BY sort_order').all() as Record<
      string,
      unknown
    >[]
    res.json(toCamelAll(rows))
  })

  router.post('/api/rooms/:roomId/seats', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const { name, color, role } = body
    if (!name || !color || !role) {
      res.status(400).json({ error: 'name, color, role required' })
      return
    }
    const id = 's-' + crypto.randomUUID().slice(0, 8)
    const count = (req.roomDb!.prepare('SELECT COUNT(*) as c FROM seats').get() as { c: number }).c
    req
      .roomDb!.prepare(
        'INSERT INTO seats (id, name, color, role, user_id, portrait_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, name, color, role, body.userId || null, body.portraitUrl || null, count)

    const seat = toCamel<Seat>(
      req.roomDb!.prepare('SELECT * FROM seats WHERE id = ?').get(id) as Record<string, unknown>,
    )
    io.to(req.roomId!).emit('seat:created', seat)
    res.status(201).json(seat)
  })

  router.patch('/api/rooms/:roomId/seats/:id', room, (req, res) => {
    const existing = req.roomDb!.prepare('SELECT id FROM seats WHERE id = ?').get(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Seat not found' })
      return
    }

    // Whitelist updatable fields (camelCase body → snake_case DB)
    const fieldMap: Record<string, string> = {
      name: 'name',
      color: 'color',
      role: 'role',
      userId: 'user_id',
      portraitUrl: 'portrait_url',
      activeCharacterId: 'active_character_id',
      sortOrder: 'sort_order',
    }
    const body = req.body as Record<string, unknown>
    const sets: string[] = []
    const values: unknown[] = []
    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (body[camel] !== undefined) {
        sets.push(`${snake} = ?`)
        values.push(body[camel])
      }
    }
    if (sets.length > 0) {
      values.push(req.params.id)
      req.roomDb!.prepare(`UPDATE seats SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = toCamel<Seat>(
      req.roomDb!.prepare('SELECT * FROM seats WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('seat:updated', updated)
    res.json(updated)
  })

  // Claim a seat (bind current user to seat)
  router.post('/api/rooms/:roomId/seats/:id/claim', room, (req, res) => {
    const existing = req.roomDb!.prepare('SELECT id FROM seats WHERE id = ?').get(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Seat not found' })
      return
    }
    // TODO: use JWT userId after identity system (doc 53)
    const claimBody = req.body as Record<string, unknown>
    const userId = (claimBody.userId as string | undefined) || 'anonymous'
    req.roomDb!.prepare('UPDATE seats SET user_id = ? WHERE id = ?').run(userId, req.params.id)
    const updated = toCamel<Seat>(
      req.roomDb!.prepare('SELECT * FROM seats WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('seat:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/seats/:id', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM seats WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('seat:deleted', { id: req.params.id as string })
    res.json({ ok: true })
  })

  return router
}
