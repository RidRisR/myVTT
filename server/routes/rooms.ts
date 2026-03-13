// server/routes/rooms.ts — Room CRUD (global DB)
import { Router } from 'express'
import crypto from 'crypto'
import { getGlobalDb, getRoomDb, toCamelAll } from '../db'

export function roomRoutes(dataDir: string): Router {
  const router = Router()

  router.get('/api/rooms', (_req, res) => {
    const db = getGlobalDb(dataDir)
    const rooms = toCamelAll<{ id: string; name: string; createdBy: string; createdAt: number }>(
      db.prepare('SELECT * FROM rooms ORDER BY created_at DESC').all() as Record<string, unknown>[],
    )
    res.json(rooms)
  })

  router.post('/api/rooms', (req, res) => {
    const { name } = req.body
    if (!name) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    const id = crypto.randomUUID().slice(0, 8)
    const db = getGlobalDb(dataDir)
    const now = Date.now()
    db.prepare('INSERT INTO rooms (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      name,
      'anonymous',
      now,
    )
    // Initialize room database (triggers schema creation)
    getRoomDb(dataDir, id)
    res.status(201).json({ id, name, createdBy: 'anonymous', createdAt: now })
  })

  router.delete('/api/rooms/:roomId', (req, res) => {
    const db = getGlobalDb(dataDir)
    const room = db
      .prepare('SELECT id FROM rooms WHERE id = ?')
      .get(req.params.roomId) as { id: string } | undefined
    if (!room) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.roomId)
    // TODO: clean up room directory on disk
    res.json({ ok: true })
  })

  return router
}
