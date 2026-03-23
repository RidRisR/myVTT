// server/routes/chat.ts — Chat messages + server-side dice rolling
import { Router } from 'express'
import crypto from 'crypto'
import type { TypedServer } from '../socketTypes'
import type { MessageOrigin, ChatMessage } from '../../src/shared/chatTypes'
import type { DiceSpec } from '../../src/shared/diceUtils'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields } from '../db'

export function chatRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function toMessage(row: Record<string, unknown>): ChatMessage {
    const msg = parseJsonFields(toCamel(row), 'rollData', 'seat', 'entity')
    const origin: MessageOrigin = {
      seat: msg.seat as MessageOrigin['seat'],
      ...(msg.entity ? { entity: msg.entity as MessageOrigin['entity'] } : {}),
    }
    if (msg.rollData && typeof msg.rollData === 'object') {
      const { rollData, seat: _s, entity: _e, ...rest } = msg
      return { ...rest, ...(rollData as Record<string, unknown>), origin } as unknown as ChatMessage
    }
    const { seat: _s, entity: _e, ...rest } = msg
    return { ...rest, origin } as unknown as ChatMessage
  }

  // Get chat history (supports incremental fetch via cursor id)
  router.get('/api/rooms/:roomId/chat', room, (req, res) => {
    const afterId = req.query.after as string | undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000)
    let rows: Record<string, unknown>[]
    if (afterId) {
      // Cursor-based pagination: fetch messages inserted after the given id (by rowid order)
      rows = req
        .roomDb!.prepare(
          `SELECT * FROM chat_messages
           WHERE rowid > COALESCE((SELECT rowid FROM chat_messages WHERE id = ?), 0)
           ORDER BY rowid ASC LIMIT ?`,
        )
        .all(afterId, limit) as Record<string, unknown>[]
    } else {
      rows = req
        .roomDb!.prepare('SELECT * FROM chat_messages ORDER BY rowid ASC LIMIT ?')
        .all(limit) as Record<string, unknown>[]
    }
    res.json(rows.map(toMessage))
  })

  // Send text message
  router.post('/api/rooms/:roomId/chat', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const { origin, content } = body as { origin: MessageOrigin; content: string }
    if (!content) {
      res.status(400).json({ error: 'content is required' })
      return
    }
    const id = crypto.randomUUID()
    const timestamp = Date.now()

    req
      .roomDb!.prepare(
        `INSERT INTO chat_messages (id, type, seat, entity, content, timestamp)
         VALUES (?, 'text', ?, ?, ?, ?)`,
      )
      .run(
        id,
        JSON.stringify(origin.seat),
        origin.entity ? JSON.stringify(origin.entity) : null,
        content,
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
    io.to(req.roomId!).emit('chat:retracted', { id: req.params.id as string })
    res.json({ ok: true })
  })

  // Server-side dice roll — pure RNG only, no formula evaluation
  router.post('/api/rooms/:roomId/roll', room, (req, res) => {
    const rollBody = (req.body ?? {}) as Record<string, unknown>
    const { origin, dice, formula, resolvedFormula, rollType, actionName } = rollBody as {
      origin: MessageOrigin
      dice: DiceSpec[]
      formula: string
      resolvedFormula?: string
      rollType?: string
      actionName?: string
    }

    if (!Array.isArray(dice) || dice.length === 0) {
      res.status(400).json({ error: 'dice is required' })
      return
    }

    // Validate bounds
    for (const spec of dice) {
      if (!spec.sides || spec.sides < 1 || spec.sides > 1000) {
        res.status(400).json({ error: `Invalid sides: ${String(spec.sides)}` })
        return
      }
      if (!spec.count || spec.count < 1 || spec.count > 100) {
        res.status(400).json({ error: `Invalid count: ${String(spec.count)}` })
        return
      }
    }

    // Generate raw random numbers — the ONLY thing the server does
    const rolls: number[][] = dice.map(({ sides, count }) =>
      Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1),
    )

    const id = crypto.randomUUID()
    const timestamp = Date.now()
    const rollData = { formula, resolvedFormula, dice, rolls, rollType, actionName }

    req
      .roomDb!.prepare(
        `INSERT INTO chat_messages (id, type, seat, entity, roll_data, timestamp)
         VALUES (?, 'roll', ?, ?, ?, ?)`,
      )
      .run(
        id,
        JSON.stringify(origin.seat),
        origin.entity ? JSON.stringify(origin.entity) : null,
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
  })

  // Judgment message (two-stage roll result)
  router.post('/api/rooms/:roomId/chat/judgment', room, (req, res) => {
    const { origin, rollMessageId, judgment, displayText, displayColor } = req.body as {
      origin: MessageOrigin
      rollMessageId: string
      judgment: { type: string; outcome: string }
      displayText: string
      displayColor: string
    }
    const id = crypto.randomUUID()
    const timestamp = Date.now()
    const rollData = { rollMessageId, judgment, displayText, displayColor }

    req
      .roomDb!.prepare(
        `INSERT INTO chat_messages (id, type, seat, entity, roll_data, timestamp)
         VALUES (?, 'judgment', ?, ?, ?, ?)`,
      )
      .run(
        id,
        JSON.stringify(origin.seat),
        origin.entity ? JSON.stringify(origin.entity) : null,
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
  })

  return router
}
