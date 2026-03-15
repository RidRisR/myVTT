// server/routes/chat.ts — Chat messages + server-side dice rolling
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields } from '../db'

export function chatRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function toMessage(row: Record<string, unknown>) {
    const msg = parseJsonFields(toCamel(row), 'rollData')
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
    const rows = req
      .roomDb!.prepare(
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

    req
      .roomDb!.prepare(
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
    const existing = req
      .roomDb!.prepare('SELECT * FROM chat_messages WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined
    if (!existing) {
      res.status(404).json({ error: 'Message not found' })
      return
    }
    req.roomDb!.prepare('DELETE FROM chat_messages WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('chat:retracted', { id: req.params.id })
    res.json({ ok: true })
  })

  // Server-side dice roll
  router.post('/api/rooms/:roomId/roll', room, async (req, res) => {
    try {
      const {
        formula,
        resolvedExpression,
        senderId,
        senderName,
        senderColor,
        portraitUrl,
        actionName,
        modifiers,
      } = req.body

      // Dynamic import of shared dice logic (tsx allows .ts imports)
      const { rollCompound } = await import('../../src/shared/diceUtils')

      const expression = resolvedExpression || formula
      const result = rollCompound(expression)
      if (!result || 'error' in result) {
        const errMsg = result && 'error' in result ? result.error : 'Invalid expression'
        res.status(400).json({ error: errMsg })
        return
      }

      const id = crypto.randomUUID()
      const timestamp = Date.now()
      const rollData = {
        expression: formula,
        resolvedExpression: expression !== formula ? expression : undefined,
        terms: result.termResults,
        total: result.total,
        actionName,
        modifiersApplied: modifiers,
      }

      req
        .roomDb!.prepare(
          `INSERT INTO chat_messages (id, type, sender_id, sender_name, sender_color, portrait_url, roll_data, timestamp)
           VALUES (?, 'roll', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          senderId,
          senderName,
          senderColor,
          portraitUrl || null,
          JSON.stringify(rollData),
          timestamp,
        )

      const message = toMessage(
        req.roomDb!.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as Record<
          string,
          unknown
        >,
      )
      io.to(req.roomId!).emit('chat:new', message)
      res.status(201).json(message)
    } catch (_err) {
      res.status(500).json({ error: 'Dice roll failed' })
    }
  })

  return router
}
