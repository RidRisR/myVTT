// server/routes/chat.ts — Chat messages + server-side dice rolling
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import type { DiceSpec } from '../../src/shared/diceUtils'
import { withRoom } from '../middleware'
import { toCamel, toCamelAll, parseJsonFields } from '../db'

export function chatRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function toMessage(row: Record<string, unknown>) {
    const msg = parseJsonFields(toCamel<Record<string, unknown>>(row), 'rollData')
    // Flatten rollData into top-level fields for client ChatRollMessage compatibility
    if (msg.rollData && typeof msg.rollData === 'object') {
      const { rollData, ...rest } = msg
      return { ...rest, ...(rollData as Record<string, unknown>) }
    }
    return msg
  }

  // Get chat history (supports incremental fetch)
  router.get('/api/rooms/:roomId/chat', room, (req, res) => {
    const after = parseInt(req.query.after as string) || 0
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000)
    const rows = req.roomDb!
      .prepare(
        'SELECT * FROM chat_messages WHERE timestamp > ? ORDER BY timestamp ASC LIMIT ?',
      )
      .all(after, limit) as Record<string, unknown>[]
    res.json(rows.map(toMessage))
  })

  // Send text message
  router.post('/api/rooms/:roomId/chat', room, (req, res) => {
    const { senderId, senderName, senderColor, portraitUrl, content } = req.body
    if (!content) {
      res.status(400).json({ error: 'content is required' })
      return
    }
    const id = crypto.randomUUID()
    const timestamp = Date.now()

    req.roomDb!
      .prepare(
        `INSERT INTO chat_messages (id, type, sender_id, sender_name, sender_color, portrait_url, content, timestamp)
         VALUES (?, 'text', ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, senderId, senderName, senderColor, portraitUrl || null, content, timestamp)

    const message = toMessage(
      req.roomDb!.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('chat:new', message)
    res.status(201).json(message)
  })

  // Retract a message
  router.post('/api/rooms/:roomId/chat/retract/:id', room, (req, res) => {
    const existing = req.roomDb!
      .prepare('SELECT * FROM chat_messages WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined
    if (!existing) {
      res.status(404).json({ error: 'Message not found' })
      return
    }
    req.roomDb!.prepare('DELETE FROM chat_messages WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('chat:retracted', { id: req.params.id })
    res.json({ ok: true })
  })

  // Server-side dice roll — pure RNG only, no formula evaluation
  router.post('/api/rooms/:roomId/roll', room, (req, res) => {
    const {
      dice,
      formula,
      resolvedFormula,
      rollType,
      senderId,
      senderName,
      senderColor,
      portraitUrl,
      actionName,
    } = req.body

    if (!Array.isArray(dice) || dice.length === 0) {
      res.status(400).json({ error: 'dice is required' })
      return
    }

    // Validate bounds
    for (const spec of dice as DiceSpec[]) {
      if (!spec.sides || spec.sides < 1 || spec.sides > 1000) {
        res.status(400).json({ error: `Invalid sides: ${spec.sides}` })
        return
      }
      if (!spec.count || spec.count < 1 || spec.count > 100) {
        res.status(400).json({ error: `Invalid count: ${spec.count}` })
        return
      }
    }

    // Generate raw random numbers — the ONLY thing the server does
    const rolls: number[][] = (dice as DiceSpec[]).map(({ sides, count }) =>
      Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1),
    )

    const id = crypto.randomUUID()
    const timestamp = Date.now()
    const rollData = { formula, resolvedFormula, dice, rolls, rollType, actionName }

    req.roomDb!
      .prepare(
        `INSERT INTO chat_messages (id, type, sender_id, sender_name, sender_color, portrait_url, roll_data, timestamp)
         VALUES (?, 'roll', ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, senderId, senderName, senderColor, portraitUrl || null, JSON.stringify(rollData), timestamp)

    const message = toMessage(
      req.roomDb!.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('chat:new', message)
    res.status(201).json(message)
  })

  return router
}
