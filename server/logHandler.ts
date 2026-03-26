// server/logHandler.ts — Socket.io handlers for game log events
import type { TypedServer, TypedSocket } from './socketTypes'
import { getRoomDb } from './db'
import { uuidv7 } from './uuidv7'
import { createEffectRegistry } from './effectRegistry'
import { shouldReceive } from './visibility'
import type { GameLogEntry, LogEntrySubmission, RollRequest } from '../src/shared/logTypes'
import { rowToEntry } from './logUtils'

// ── Broadcast helper: per-socket visibility filtering ──

async function broadcastLogEntry(
  io: TypedServer,
  roomId: string,
  entry: GameLogEntry,
): Promise<void> {
  const sockets = await io.in(roomId).fetchSockets()
  for (const remote of sockets) {
    if (shouldReceive(entry.visibility, remote.data.seatId, remote.data.role)) {
      remote.emit('log:new', entry)
    }
  }
}

// ── Main setup ──

export function setupLogHandlers(io: TypedServer, dataDir: string): void {
  const effectRegistry = createEffectRegistry()

  io.on('connection', (socket: TypedSocket) => {
    const roomId = socket.data.roomId
    if (!roomId) return // admin connections — no log handlers

    const db = getRoomDb(dataDir, roomId)

    // ── log:entry handler ──
    socket.on('log:entry', (submission: LogEntrySubmission, ack) => {
      // 1. Reject if no seat claimed
      if (!socket.data.seatId) {
        ack({ error: 'No seat claimed' })
        return
      }

      // 2. Validate required fields
      if (!submission.id || typeof submission.id !== 'string') {
        ack({ error: 'Missing or invalid id' })
        return
      }
      if (!submission.type || typeof submission.type !== 'string') {
        ack({ error: 'Missing or invalid type' })
        return
      }
      if (!submission.type.includes(':')) {
        ack({ error: 'Type must use namespace:name format (e.g. core:text)' })
        return
      }

      // 3. Force override executor from socket's claimed seatId
      const executor = socket.data.seatId

      // 4. Transaction: insert + effects + get seq
      const { entry, isNew } = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT OR IGNORE INTO game_log
             (id, type, origin, executor, parent_id, chain_depth, triggerable, visibility, base_seq, payload, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            submission.id,
            submission.type,
            JSON.stringify(submission.origin),
            executor,
            submission.parentId ?? null,
            submission.chainDepth,
            submission.triggerable ? 1 : 0,
            JSON.stringify(submission.visibility),
            submission.baseSeq,
            JSON.stringify(submission.payload),
            submission.timestamp,
          )

        // Read row to get seq (works for both new inserts and duplicate attempts)
        const row = db.prepare('SELECT * FROM game_log WHERE id = ?').get(submission.id) as Record<
          string,
          unknown
        >
        const parsed = rowToEntry(row)

        // If new entry (not duplicate): run effects which may mutate payload
        if (info.changes > 0) {
          const hadEffect = effectRegistry.run(db, parsed)
          // Only update payload in DB if an effect handler actually ran
          if (hadEffect) {
            db.prepare('UPDATE game_log SET payload = ? WHERE id = ?').run(
              JSON.stringify(parsed.payload),
              parsed.id,
            )
          }
        }

        return { entry: parsed, isNew: info.changes > 0 }
      })()

      // 5. Only broadcast new entries (not duplicates)
      if (isNew) {
        void broadcastLogEntry(io, roomId, entry)
      }

      // 6. Ack with complete GameLogEntry
      ack(entry)
    })

    // ── log:roll-request handler ──
    socket.on('log:roll-request', (request: RollRequest, ack) => {
      // 1. Reject if no seat claimed
      if (!socket.data.seatId) {
        ack({ error: 'No seat claimed' })
        return
      }

      // 2. Validate dice bounds
      for (const spec of request.dice) {
        if (spec.sides < 1 || spec.sides > 1000) {
          ack({ error: `Invalid dice sides: ${spec.sides} (must be 1-1000)` })
          return
        }
        if (spec.count < 1 || spec.count > 100) {
          ack({ error: `Invalid dice count: ${spec.count} (must be 1-100)` })
          return
        }
      }

      // 3. Generate random rolls
      const rolls: number[][] = request.dice.map((spec) =>
        Array.from({ length: spec.count }, () => Math.floor(Math.random() * spec.sides) + 1),
      )

      // 4. Create core:roll-result entry with server-generated UUIDv7
      const id = uuidv7()
      const executor = socket.data.seatId
      const timestamp = Date.now()

      const total = rolls.flat().reduce((a, b) => a + b, 0)

      const payload: Record<string, unknown> = {
        dice: request.dice,
        rolls,
        total,
        formula: request.formula,
      }
      if (request.resolvedFormula) payload.resolvedFormula = request.resolvedFormula
      if (request.rollType) payload.rollType = request.rollType
      if (request.actionName) payload.actionName = request.actionName

      // 5. Insert into game_log + get seq
      const entry = db.transaction(() => {
        db.prepare(
          `INSERT INTO game_log
           (id, type, origin, executor, parent_id, chain_depth, triggerable, visibility, base_seq, payload, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          'core:roll-result',
          JSON.stringify(request.origin),
          executor,
          request.parentId ?? null,
          request.chainDepth,
          request.triggerable ? 1 : 0,
          JSON.stringify(request.visibility),
          0, // baseSeq: roll results don't reference a base
          JSON.stringify(payload),
          timestamp,
        )

        const row = db.prepare('SELECT * FROM game_log WHERE id = ?').get(id) as Record<
          string,
          unknown
        >
        return rowToEntry(row)
      })()

      // 6. Broadcast + ack
      void broadcastLogEntry(io, roomId, entry)
      ack(entry)
    })

    // ── log:history handler ──
    socket.on('log:history', (query, ack) => {
      const limit = Math.min(Math.max(query.limit ?? 50, 1), 500)

      let rows: Record<string, unknown>[]
      if (query.beforeSeq != null) {
        rows = db
          .prepare('SELECT * FROM game_log WHERE seq < ? ORDER BY seq DESC LIMIT ?')
          .all(query.beforeSeq, limit) as Record<string, unknown>[]
      } else {
        rows = db.prepare('SELECT * FROM game_log ORDER BY seq DESC LIMIT ?').all(limit) as Record<
          string,
          unknown
        >[]
      }

      // Filter by visibility per socket.
      // NOTE: Post-query filtering may return fewer entries than `limit`.
      // Acceptable for v1 — a proper fix would fetch in a loop until the desired count is met.
      const entries = rows
        .map(rowToEntry)
        .filter((e) => shouldReceive(e.visibility, socket.data.seatId, socket.data.role))

      // Return in seq ASC order
      entries.reverse()
      ack(entries)
    })
  })
}
