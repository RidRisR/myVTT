// server/routes/combat.ts — Combat runtime state API
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields } from '../db'

const DEFAULT_GRID = {
  size: 50,
  snap: true,
  visible: true,
  color: 'rgba(255,255,255,0.15)',
  offsetX: 0,
  offsetY: 0,
}

export function combatRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  function getCombatState(db: import('better-sqlite3').Database) {
    const row = db.prepare('SELECT * FROM combat_state WHERE id = 1').get() as Record<
      string,
      unknown
    >
    const parsed = parseJsonFields(
      toCamel<Record<string, unknown>>(row),
      'grid',
      'tokens',
      'initiativeOrder',
    )
    // Ensure grid always has complete defaults
    parsed.grid = { ...DEFAULT_GRID, ...(parsed.grid as object) }
    return parsed
  }

  router.get('/api/rooms/:roomId/combat', room, (req, res) => {
    res.json(getCombatState(req.roomDb!))
  })

  router.patch('/api/rooms/:roomId/combat', room, (req, res) => {
    const sets: string[] = []
    const values: unknown[] = []

    const simpleFields: Record<string, string> = {
      mapUrl: 'map_url',
      mapWidth: 'map_width',
      mapHeight: 'map_height',
      initiativeIndex: 'initiative_index',
    }
    for (const [camel, snake] of Object.entries(simpleFields)) {
      if (req.body[camel] !== undefined) {
        sets.push(`${snake} = ?`)
        values.push(req.body[camel])
      }
    }
    // Grid: deep merge with existing values
    if (req.body.grid !== undefined) {
      const existing = req.roomDb!
        .prepare('SELECT grid FROM combat_state WHERE id = 1')
        .get() as { grid: string }
      const existingGrid = JSON.parse(existing.grid || '{}')
      const merged = { ...existingGrid, ...req.body.grid }
      sets.push('grid = ?')
      values.push(JSON.stringify(merged))
    }
    for (const key of ['tokens', 'initiativeOrder'] as const) {
      const snakeKey =
        key === 'initiativeOrder' ? 'initiative_order' : key
      if (req.body[key] !== undefined) {
        sets.push(`${snakeKey} = ?`)
        values.push(JSON.stringify(req.body[key]))
      }
    }
    if (sets.length > 0) {
      req.roomDb!
        .prepare(`UPDATE combat_state SET ${sets.join(', ')} WHERE id = 1`)
        .run(...values)
    }

    const updated = getCombatState(req.roomDb!)
    io.to(req.roomId!).emit('combat:updated', updated)
    res.json(updated)
  })

  // Token CRUD within combat_state.tokens JSON
  router.post('/api/rooms/:roomId/combat/tokens', room, (req, res) => {
    const tokenId = req.body.id || crypto.randomUUID()
    const state = req.roomDb!
      .prepare('SELECT tokens FROM combat_state WHERE id = 1')
      .get() as { tokens: string }
    const tokens = JSON.parse(state.tokens || '{}')
    const token = { ...req.body, id: tokenId }
    tokens[tokenId] = token
    req.roomDb!
      .prepare('UPDATE combat_state SET tokens = ? WHERE id = 1')
      .run(JSON.stringify(tokens))
    io.to(req.roomId!).emit('combat:token:added', token)
    res.status(201).json(token)
  })

  router.patch('/api/rooms/:roomId/combat/tokens/:tokenId', room, (req, res) => {
    const tid = req.params.tokenId as string
    const state = req.roomDb!
      .prepare('SELECT tokens FROM combat_state WHERE id = 1')
      .get() as { tokens: string }
    const tokens = JSON.parse(state.tokens || '{}')
    if (!tokens[tid]) {
      res.status(404).json({ error: 'Token not found' })
      return
    }
    tokens[tid] = { ...tokens[tid], ...req.body }
    req.roomDb!
      .prepare('UPDATE combat_state SET tokens = ? WHERE id = 1')
      .run(JSON.stringify(tokens))
    io.to(req.roomId!).emit('combat:token:updated', {
      tokenId: tid,
      changes: req.body,
    })
    res.json(tokens[tid])
  })

  router.delete('/api/rooms/:roomId/combat/tokens/:tokenId', room, (req, res) => {
    const tid = req.params.tokenId as string
    const state = req.roomDb!
      .prepare('SELECT tokens FROM combat_state WHERE id = 1')
      .get() as { tokens: string }
    const tokens = JSON.parse(state.tokens || '{}')
    delete tokens[tid]
    req.roomDb!
      .prepare('UPDATE combat_state SET tokens = ? WHERE id = 1')
      .run(JSON.stringify(tokens))
    io.to(req.roomId!).emit('combat:token:removed', { tokenId: req.params.tokenId })
    res.json({ ok: true })
  })

  // Start combat (ad-hoc, no pre-existing encounter required)
  // Combat state (map, tokens, grid) is preserved across sessions —
  // only cleared explicitly via PATCH /combat or when activating a saved encounter.
  router.post('/api/rooms/:roomId/combat/start', room, (req, res) => {
    const encounterId = `adhoc-${crypto.randomUUID()}`
    req.roomDb!
      .prepare('UPDATE room_state SET active_encounter_id = ? WHERE id = 1')
      .run(encounterId)

    const combatState = getCombatState(req.roomDb!)
    io.to(req.roomId!).emit('combat:activated', combatState)
    io.to(req.roomId!).emit('room:state:updated', { activeEncounterId: encounterId })
    res.json(combatState)
  })

  // End combat — deactivates the session but preserves combat state (map, tokens, grid)
  // so GM can resume where they left off.
  router.post('/api/rooms/:roomId/combat/end', room, (req, res) => {
    req.roomDb!
      .prepare('UPDATE room_state SET active_encounter_id = NULL WHERE id = 1')
      .run()
    io.to(req.roomId!).emit('combat:ended', {})
    io.to(req.roomId!).emit('room:state:updated', { activeEncounterId: null })
    res.json({ ok: true })
  })

  return router
}
