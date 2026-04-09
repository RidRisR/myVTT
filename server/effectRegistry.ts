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

  handlers.set('core:component-update', (db, entry) => {
    const { entityId, key, data } = entry.payload as {
      entityId: string
      key: string
      data: unknown
    }
    // Verify entity exists before INSERT to produce a clear error instead of FK crash
    const exists = db.prepare('SELECT 1 FROM entities WHERE id = ?').get(entityId)
    if (!exists) {
      throw new Error(`component-update failed: entity "${entityId}" not found`)
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
