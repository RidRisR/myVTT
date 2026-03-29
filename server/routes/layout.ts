// server/routes/layout.ts
import { Router } from 'express'
import type { TypedServer } from '../socketTypes'
import { withRoom, withRole } from '../middleware'

export function layoutRoutes(dataDir: string, io: TypedServer) {
  const router = Router()
  const room = withRoom(dataDir)

  // GET /api/rooms/:roomId/layout — fetch current layout config
  router.get('/api/rooms/:roomId/layout', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT config FROM layout WHERE id = 1').get() as
      | { config: string }
      | undefined
    const config = row
      ? (JSON.parse(row.config) as {
          narrative: Record<string, unknown>
          tactical: Record<string, unknown>
        })
      : { narrative: {}, tactical: {} }
    res.json(config)
  })

  // PUT /api/rooms/:roomId/layout — save layout config (GM only)
  router.put('/api/rooms/:roomId/layout', room, withRole, (req, res) => {
    if (req.role !== 'GM') {
      res.status(403).json({ error: 'Only GM can modify layout' })
      return
    }
    const body = req.body as {
      narrative: Record<string, unknown>
      tactical: Record<string, unknown>
    }
    const config = JSON.stringify(body)
    req.roomDb!.prepare('UPDATE layout SET config = ? WHERE id = 1').run(config)
    // Broadcast to all clients in the room
    io.to(req.roomId!).emit('layout:updated', body)
    res.json(body)
  })

  return router
}
