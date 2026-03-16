// server/routes/state.ts — Room state (singleton) GET + PATCH
import { Router } from 'express'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'
import { toCamel } from '../db'
import { getTacticalState } from './tactical'

export function stateRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/state', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<
      string,
      unknown
    >
    res.json(toCamel(row))
  })

  router.patch('/api/rooms/:roomId/state', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const sets: string[] = []
    const values: unknown[] = []

    const fieldMap: Record<string, string> = {
      activeSceneId: 'active_scene_id',
    }
    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (body[camel] !== undefined) {
        sets.push(`${snake} = ?`)
        values.push(body[camel])
      }
    }
    if (sets.length > 0) {
      req.roomDb!.prepare(`UPDATE room_state SET ${sets.join(', ')} WHERE id = 1`).run(...values)
    }

    const updated = toCamel(
      req.roomDb!.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<string, unknown>,
    )
    io.to(req.roomId!).emit('room:state:updated', updated)

    // When scene changes, broadcast the new scene's tactical state
    if (body.activeSceneId) {
      const tactical = getTacticalState(req.roomDb!, body.activeSceneId as string)
      if (tactical) {
        io.to(req.roomId!).emit('tactical:updated', tactical)
      }
    }

    res.json(updated)
  })

  return router
}
