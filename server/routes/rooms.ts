// server/routes/rooms.ts — Room CRUD (global DB)
import { Router } from 'express'
import crypto from 'crypto'
import fs from 'fs'
import { getGlobalDb, getRoomDb, closeRoomDb, toCamel, toCamelAll, safePath } from '../db'
import type { TypedServer } from '../socketTypes'

export function roomRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()

  router.get('/api/rooms', async (_req, res) => {
    const db = getGlobalDb(dataDir)
    const rooms = toCamelAll(
      db.prepare('SELECT * FROM rooms ORDER BY created_at DESC').all() as Record<string, unknown>[],
    )

    // Enrich each room with online seat colors
    const enriched = await Promise.all(
      rooms.map(async (room) => {
        const roomId = room.id as string
        try {
          const sockets = await io.in(roomId).fetchSockets()
          const seatIds = [...new Set(sockets.map((s) => s.data.seatId).filter(Boolean))]
          let onlineColors: string[] = []
          if (seatIds.length > 0) {
            const roomDb = getRoomDb(dataDir, roomId)
            const placeholders = seatIds.map(() => '?').join(',')
            const seats = roomDb
              .prepare(`SELECT color FROM seats WHERE id IN (${placeholders})`)
              .all(...seatIds) as { color: string }[]
            onlineColors = seats.map((s) => s.color)
          }
          return { ...room, onlineColors }
        } catch {
          return { ...room, onlineColors: [] }
        }
      }),
    )

    res.json(enriched)
  })

  router.post('/api/rooms', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const { name, ruleSystemId = 'generic' } = body
    if (!name) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    const id = crypto.randomUUID().slice(0, 8)
    const db = getGlobalDb(dataDir)
    const now = Date.now()
    db.prepare(
      'INSERT INTO rooms (id, name, created_by, created_at, rule_system_id) VALUES (?, ?, ?, ?, ?)',
    ).run(id, name, 'anonymous', now, ruleSystemId)
    // Initialize room database (triggers schema creation)
    const roomDb = getRoomDb(dataDir, id)

    // Create default scene + tactical_state so "room has ≥1 scene" holds from creation.
    // This eliminates the race condition where the client's fire-and-forget auto-create
    // scene hasn't completed before other operations (e.g. entering tactical mode).
    const sceneId = crypto.randomUUID()
    roomDb.transaction(() => {
      roomDb
        .prepare(
          "INSERT INTO scenes (id, name, sort_order, atmosphere) VALUES (?, 'Scene 1', 0, ?)",
        )
        .run(
          sceneId,
          JSON.stringify({
            imageUrl: '',
            width: 1920,
            height: 1080,
            particlePreset: 'none',
            ambientPreset: '',
            ambientAudioUrl: '',
            ambientAudioVolume: 0.5,
          }),
        )
      roomDb.prepare('INSERT INTO tactical_state (scene_id) VALUES (?)').run(sceneId)
      roomDb.prepare('UPDATE room_state SET active_scene_id = ? WHERE id = 1').run(sceneId)
    })()

    res.status(201).json({ id, name, createdBy: 'anonymous', createdAt: now, ruleSystemId })
  })

  router.get('/api/rooms/:roomId', (req, res) => {
    const db = getGlobalDb(dataDir)
    const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.roomId) as
      | Record<string, unknown>
      | undefined
    if (!row) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    res.json(toCamel(row))
  })

  router.delete('/api/rooms/:roomId', (req, res) => {
    const db = getGlobalDb(dataDir)
    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(req.params.roomId) as
      | { id: string }
      | undefined
    if (!room) {
      res.status(404).json({ error: 'Room not found' })
      return
    }
    db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.roomId)
    // Close cached DB handle before deleting directory
    closeRoomDb(req.params.roomId)
    const roomDir = safePath(dataDir, 'rooms', req.params.roomId)
    fs.rmSync(roomDir, { recursive: true, force: true })
    res.json({ ok: true })
  })

  return router
}
