// server/tagHelpers.ts — Tag normalization, sync, and query helpers
import crypto from 'crypto'
import type Database from 'better-sqlite3'
import { toCamel, parseJsonFields } from './db'

export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function validateTagName(name: string): boolean {
  const normalized = normalizeTagName(name)
  return normalized.length > 0 && normalized.length <= 100
}

export function findOrCreateTag(db: Database.Database, name: string): string {
  const normalized = normalizeTagName(name)
  const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(normalized) as
    | { id: string }
    | undefined
  if (existing) return existing.id
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)').run(
    id,
    normalized,
    Date.now(),
  )
  return id
}

export function syncTags(
  db: Database.Database,
  junctionTable: 'asset_tags' | 'blueprint_tags' | 'entity_tags',
  fkColumn: 'asset_id' | 'blueprint_id' | 'entity_id',
  entityId: string,
  tagNames: string[],
): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM ${junctionTable} WHERE ${fkColumn} = ?`).run(entityId)
    const insert = db.prepare(`INSERT INTO ${junctionTable} (${fkColumn}, tag_id) VALUES (?, ?)`)
    for (const name of tagNames) {
      const tagId = findOrCreateTag(db, name)
      insert.run(entityId, tagId)
    }
  })()
}

export function getTagNames(
  db: Database.Database,
  junctionTable: 'asset_tags' | 'blueprint_tags' | 'entity_tags',
  fkColumn: 'asset_id' | 'blueprint_id' | 'entity_id',
  entityId: string,
): string[] {
  const rows = db
    .prepare(
      `SELECT t.name FROM tags t JOIN ${junctionTable} jt ON t.id = jt.tag_id WHERE jt.${fkColumn} = ?`,
    )
    .all(entityId) as { name: string }[]
  return rows.map((r) => r.name)
}

export function getAllTags(
  db: Database.Database,
): { id: string; name: string; color: string | null; sortOrder: number; createdAt: number }[] {
  return db
    .prepare(
      'SELECT id, name, color, sort_order AS sortOrder, created_at AS createdAt FROM tags ORDER BY sort_order, name',
    )
    .all() as {
    id: string
    name: string
    color: string | null
    sortOrder: number
    createdAt: number
  }[]
}

export function toAssetWithTags(
  db: Database.Database,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const base = parseJsonFields(toCamel(row), 'extra')
  base.tags = getTagNames(db, 'asset_tags', 'asset_id', row.id as string)
  return base
}

export function toBlueprintWithTags(
  db: Database.Database,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const base = parseJsonFields(toCamel(row), 'defaults')
  base.tags = getTagNames(db, 'blueprint_tags', 'blueprint_id', row.id as string)
  return base
}
