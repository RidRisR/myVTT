// server/routes/showcase.ts — Showcase items CRUD
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'
import { toCamel, toBoolFields, parseJsonFields } from '../db'

export function showcaseRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function toShowcase(row: Record<string, unknown>) {
    const r = parseJsonFields(toCamel(row), 'data')
    return toBoolFields(r, 'pinned')
  }

  router.get('/api/rooms/:roomId/showcase', room, (req, res) => {
    const rows = req
      .roomDb!.prepare('SELECT * FROM showcase_items ORDER BY sort_order')
      .all() as Record<string, unknown>[]
    res.json(rows.map(toShowcase))
  })

  router.post('/api/rooms/:roomId/showcase', room, (req, res) => {
    const id = req.body.id || crypto.randomUUID()
    const { type = 'image', data = {}, pinned = false, sortOrder } = req.body
    const count = (
      req.roomDb!.prepare('SELECT COUNT(*) as c FROM showcase_items').get() as { c: number }
    ).c
    req
      .roomDb!.prepare(
        'INSERT INTO showcase_items (id, type, data, pinned, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, type, JSON.stringify(data), pinned ? 1 : 0, sortOrder ?? count, Date.now())

    const item = toShowcase(
      req.roomDb!.prepare('SELECT * FROM showcase_items WHERE id = ?').get(id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('showcase:created', item)
    res.status(201).json(item)
  })

  router.patch('/api/rooms/:roomId/showcase/:id', room, (req, res) => {
    const existing = req
      .roomDb!.prepare('SELECT * FROM showcase_items WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined
    if (!existing) {
      res.status(404).json({ error: 'Showcase item not found' })
      return
    }

    const sets: string[] = []
    const values: unknown[] = []

    if (req.body.type !== undefined) {
      sets.push('type = ?')
      values.push(req.body.type)
    }
    if (req.body.data !== undefined) {
      sets.push('data = ?')
      values.push(JSON.stringify(req.body.data))
    }
    if (req.body.sortOrder !== undefined) {
      sets.push('sort_order = ?')
      values.push(req.body.sortOrder)
    }
    if (req.body.pinned !== undefined) {
      sets.push('pinned = ?')
      values.push(req.body.pinned ? 1 : 0)
    }
    if (sets.length > 0) {
      values.push(req.params.id)
      req
        .roomDb!.prepare(`UPDATE showcase_items SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values)
    }

    const updated = toShowcase(
      req.roomDb!.prepare('SELECT * FROM showcase_items WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('showcase:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/showcase/:id', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM showcase_items WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('showcase:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  // Pin a showcase item
  router.post('/api/rooms/:roomId/showcase/:id/pin', room, (req, res) => {
    const existing = req
      .roomDb!.prepare('SELECT id FROM showcase_items WHERE id = ?')
      .get(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Showcase item not found' })
      return
    }
    req.roomDb!.prepare('UPDATE showcase_items SET pinned = 1 WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('showcase:pinned', { id: req.params.id })
    res.json({ ok: true })
  })

  // Unpin all showcase items
  router.post('/api/rooms/:roomId/showcase/unpin', room, (req, res) => {
    req.roomDb!.prepare('UPDATE showcase_items SET pinned = 0 WHERE pinned = 1').run()
    io.to(req.roomId!).emit('showcase:unpinned', {})
    res.json({ ok: true })
  })

  // Clear all showcase items
  router.delete('/api/rooms/:roomId/showcase', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM showcase_items').run()
    io.to(req.roomId!).emit('showcase:cleared', {})
    res.json({ ok: true })
  })

  return router
}
