// server/routes/layout.ts
import { Router } from 'express'
import type { TypedServer } from '../socketTypes'
import { withRoom } from '../middleware'

export function layoutRoutes(dataDir: string, io: TypedServer) {
  const router = Router()
  const room = withRoom(dataDir)

  // GET /api/rooms/:roomId/layout — fetch current layout config
  router.get('/api/rooms/:roomId/layout', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT config FROM layout WHERE id = 1').get() as
      | { config: string }
      | undefined
    const config = row ? JSON.parse(row.config) : { narrative: {}, tactical: {} }
    res.json(config)
  })

  // PUT /api/rooms/:roomId/layout — save layout config (GM only in future)
  router.put('/api/rooms/:roomId/layout', room, (req, res) => {
    const config = JSON.stringify(req.body)
    req.roomDb!.prepare('UPDATE layout SET config = ? WHERE id = 1').run(config)
    // Broadcast to all clients in the room
    io.to(req.roomId!).emit('layout:updated', req.body)
    res.json(req.body)
  })

  return router
}
