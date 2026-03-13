// server/routes/showcase.ts — Showcase items CRUD
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'
import { toCamel, toCamelAll, toBoolFields } from '../db'

export function showcaseRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function toShowcase(row: Record<string, unknown>) {
    return toBoolFields(toCamel<Record<string, unknown>>(row), 'pinned')
  }

  router.get('/api/rooms/:roomId/showcase', room, (req, res) => {
    const rows = req.roomDb!
      .prepare('SELECT * FROM showcase_items ORDER BY sort_order')
      .all() as Record<string, unknown>[]
    res.json(rows.map(toShowcase))
  })

  router.post('/api/rooms/:roomId/showcase', room, (req, res) => {
    const id = crypto.randomUUID()
    const { imageUrl, title = '', pinned = false, sortOrder } = req.body
    if (!imageUrl) {
      res.status(400).json({ error: 'imageUrl is required' })
      return
    }
    const count = (
      req.roomDb!.prepare('SELECT COUNT(*) as c FROM showcase_items').get() as { c: number }
    ).c
    req.roomDb!
      .prepare(
        'INSERT INTO showcase_items (id, image_url, title, pinned, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, imageUrl, title, pinned ? 1 : 0, sortOrder ?? count, Date.now())

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
    const existing = req.roomDb!
      .prepare('SELECT id FROM showcase_items WHERE id = ?')
      .get(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Showcase item not found' })
      return
    }

    const fieldMap: Record<string, string> = {
      imageUrl: 'image_url',
      title: 'title',
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
    if (req.body.pinned !== undefined) {
      sets.push('pinned = ?')
      values.push(req.body.pinned ? 1 : 0)
    }
    if (sets.length > 0) {
      values.push(req.params.id)
      req.roomDb!
        .prepare(`UPDATE showcase_items SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values)
    }

    const updated = toShowcase(
      req.roomDb!
        .prepare('SELECT * FROM showcase_items WHERE id = ?')
        .get(req.params.id) as Record<string, unknown>,
    )
    io.to(req.roomId!).emit('showcase:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/showcase/:id', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM showcase_items WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('showcase:deleted', { id: req.params.id })
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
