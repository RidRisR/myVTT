// server/entitySocketHandler.ts — Socket.io handlers for entity create/delete from workflows
import type { TypedServer, TypedSocket } from './socketTypes'
import { getRoomDb } from './db'
import { loadEntity, degradeTokenReferences } from './routes/entities'
import { syncTags } from './tagHelpers'

export function setupEntitySocketHandlers(io: TypedServer, dataDir: string): void {
  io.on('connection', (socket: TypedSocket) => {
    const roomId = socket.data.roomId
    if (!roomId) return // admin connections — no entity handlers

    const db = getRoomDb(dataDir, roomId)

    // ── entity:create-request handler ──
    socket.on('entity:create-request', (data, ack) => {
      if (!socket.data.seatId) {
        ack({ error: 'No seat claimed' })
        return
      }

      if (!data.id || typeof data.id !== 'string') {
        ack({ error: 'Missing or invalid entity id' })
        return
      }

      try {
        const { id, components = {}, lifecycle = 'ephemeral', tags = [] } = data

        db.transaction(() => {
          db.prepare(
            `INSERT INTO entities (id, permissions, lifecycle, blueprint_id)
             VALUES (?, ?, ?, ?)`,
          ).run(id, JSON.stringify({ default: 'observer', seats: {} }), lifecycle, null)

          // Insert components
          const insertComp = db.prepare(
            'INSERT INTO entity_components (entity_id, component_key, data) VALUES (?, ?, ?)',
          )
          const comps = components
          for (const [key, value] of Object.entries(comps)) {
            insertComp.run(id, key, JSON.stringify(value))
          }

          // Sync tags
          const tagNames = Array.isArray(tags) ? (tags) : []
          if (tagNames.length > 0) {
            syncTags(db, 'entity_tags', 'entity_id', id, tagNames)
          }

          // Persistent entities auto-link to all existing scenes
          if (lifecycle === 'persistent') {
            const scenes = db.prepare('SELECT id FROM scenes').all() as { id: string }[]
            const stmt = db.prepare(
              'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, 1)',
            )
            for (const s of scenes) {
              stmt.run(s.id, id)
            }
          }
        })()

        const entity = loadEntity(db, id)!
        io.to(roomId).emit('entity:created', entity)
        ack(entity)
      } catch (err) {
        ack({ error: err instanceof Error ? err.message : 'Entity creation failed' })
      }
    })

    // ── entity:delete-request handler ──
    socket.on('entity:delete-request', (data, ack) => {
      if (!socket.data.seatId) {
        ack({ error: 'No seat claimed' })
        return
      }

      if (!data.id || typeof data.id !== 'string') {
        ack({ error: 'Missing or invalid entity id' })
        return
      }

      try {
        const existing = db.prepare('SELECT id FROM entities WHERE id = ?').get(data.id)
        if (!existing) {
          ack({ error: 'Entity not found' })
          return
        }

        db.transaction(() => {
          degradeTokenReferences(db, data.id)
          // Clear dangling seats.active_character_id references
          db.prepare(
            'UPDATE seats SET active_character_id = NULL WHERE active_character_id = ?',
          ).run(data.id)
          // CASCADE handles entity_components and entity_tags
          db.prepare('DELETE FROM entities WHERE id = ?').run(data.id)
        })()

        io.to(roomId).emit('entity:deleted', { id: data.id })
        ack({ ok: true })
      } catch (err) {
        ack({ error: err instanceof Error ? err.message : 'Entity deletion failed' })
      }
    })
  })
}
