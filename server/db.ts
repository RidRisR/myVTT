// server/db.ts — SQLite connection management + naming conversion utilities
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { initRoomSchema, initGlobalSchema } from './schema'

// ── Connection caches ──
const roomDbs = new Map<string, Database.Database>()
let globalDb: Database.Database | null = null

export function getGlobalDb(dataDir: string): Database.Database {
  if (globalDb) return globalDb
  fs.mkdirSync(dataDir, { recursive: true })
  const db = new Database(path.join(dataDir, 'global.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initGlobalSchema(db)
  globalDb = db
  return db
}

export function getRoomDb(dataDir: string, roomId: string): Database.Database {
  const cached = roomDbs.get(roomId)
  if (cached) return cached
  const roomDir = path.join(dataDir, 'rooms', roomId)
  fs.mkdirSync(roomDir, { recursive: true })
  const db = new Database(path.join(roomDir, 'room.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initRoomSchema(db)
  roomDbs.set(roomId, db)
  return db
}

export function closeRoomDb(roomId: string): void {
  const db = roomDbs.get(roomId)
  if (db) {
    db.close()
    roomDbs.delete(roomId)
  }
}

export function closeAllDbs(): void {
  for (const [, db] of roomDbs) db.close()
  roomDbs.clear()
  if (globalDb) {
    globalDb.close()
    globalDb = null
  }
}

// ── Naming convention converters (A2: server returns camelCase) ──

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** Convert a DB row's snake_case keys to camelCase */
export function toCamel<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value
  }
  return result as T
}

/** Batch convert */
export function toCamelAll<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => toCamel<T>(r))
}

/** Parse JSON string fields in a row, returning the parsed object */
export function parseJsonFields(
  row: Record<string, unknown>,
  ...fields: string[]
): Record<string, unknown> {
  const result = { ...row }
  for (const field of fields) {
    const val = result[field]
    if (typeof val === 'string') {
      try {
        result[field] = JSON.parse(val)
      } catch {
        console.warn(`parseJsonFields: invalid JSON in field "${field}":`, val)
      }
    }
  }
  return result
}

/** Convert SQLite integer (0/1) fields to boolean */
export function toBoolFields(
  row: Record<string, unknown>,
  ...fields: string[]
): Record<string, unknown> {
  const result = { ...row }
  for (const field of fields) {
    result[field] = !!result[field]
  }
  return result
}
