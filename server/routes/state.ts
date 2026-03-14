// server/routes/state.ts — Room state (singleton) GET + PATCH
import { Router } from 'express'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'
import { toCamel } from '../db'

export function stateRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/state', room, (req, res) => {
    const row = req.roomDb!
      .prepare('SELECT * FROM room_state WHERE id = 1')
      .get() as Record<string, unknown>
    res.json(toCamel(row))
  })

  router.patch('/api/rooms/:roomId/state', room, (req, res) => {
    const sets: string[] = []
    const values: unknown[] = []

    const fieldMap: Record<string, string> = {
      activeSceneId: 'active_scene_id',
      activeEncounterId: 'active_encounter_id',
    }
    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (req.body[camel] !== undefined) {
        sets.push(`${snake} = ?`)
        values.push(req.body[camel])
      }
    }
    if (sets.length > 0) {
      req.roomDb!
        .prepare(`UPDATE room_state SET ${sets.join(', ')} WHERE id = 1`)
        .run(...values)
    }

    const updated = toCamel(
      req.roomDb!.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('room:state:updated', updated)
    res.json(updated)
  })

  return router
}
