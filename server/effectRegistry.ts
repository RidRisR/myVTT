// server/effectRegistry.ts
import type Database from 'better-sqlite3'
import type { GameLogEntry } from '../src/shared/logTypes'

/**
 * Side-effect handler for a specific log entry type.
 * Handlers MAY mutate `entry.payload` (e.g., to add a snapshot);
 * the caller will persist mutations back to the DB.
 */
export type EffectHandler = (db: Database.Database, entry: GameLogEntry) => void

export interface EffectRegistry {
  register(type: string, handler: EffectHandler): void
  /** Run the effect handler for the entry type. Returns true if a handler ran. */
  run(db: Database.Database, entry: GameLogEntry): boolean
}

export function createEffectRegistry(): EffectRegistry {
  const handlers = new Map<string, EffectHandler>()

  // ── Core effect handlers ──

  handlers.set('core:tracker-update', (db, entry) => {
    const payload = entry.payload
    // Support two payload formats:
    //   1. { trackerId, delta } — direct ID + relative increment (preferred)
    //   2. { label, current } — label lookup + absolute set (deprecated ctx.updateTeamTracker)
    if ('trackerId' in payload && 'delta' in payload) {
      const { trackerId, delta } = payload as { trackerId: string; delta: number }
      db.prepare('UPDATE team_trackers SET current = current + ? WHERE id = ?').run(
        delta,
        trackerId,
      )
      const snapshot = db.prepare('SELECT * FROM team_trackers WHERE id = ?').get(trackerId)
      if (snapshot) entry.payload.snapshot = snapshot
    } else if ('label' in payload) {
      const { label, current } = payload as { label: string; current?: number }
      if (current != null) {
        db.prepare('UPDATE team_trackers SET current = ? WHERE label = ?').run(current, label)
      }
      const snapshot = db.prepare('SELECT * FROM team_trackers WHERE label = ?').get(label)
      if (snapshot) entry.payload.snapshot = snapshot
    }
  })

  handlers.set('core:component-update', (db, entry) => {
    const { entityId, key, data } = entry.payload as {
      entityId: string
      key: string
      data: unknown
    }
    db.prepare(
      'INSERT OR REPLACE INTO entity_components (entity_id, component_key, data) VALUES (?, ?, ?)',
    ).run(entityId, key, JSON.stringify(data))
  })

  return {
    register(type, handler) {
      handlers.set(type, handler)
    },
    run(db, entry) {
      const handler = handlers.get(entry.type)
      if (handler) {
        handler(db, entry)
        return true
      }
      return false
    },
  }
}
