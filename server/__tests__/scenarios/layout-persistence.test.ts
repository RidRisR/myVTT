import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initRoomSchema } from '../../schema'

describe('layout table', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initRoomSchema(db)
  })

  it('layout table is created with room schema', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='layout'")
      .all()
    expect(tables).toHaveLength(1)
  })

  it('stores and retrieves layout JSON', () => {
    const config = JSON.stringify({
      narrative: { 'core.chat#1': { x: 10, y: 20, width: 300, height: 400, zOrder: 0 } },
      tactical: {},
    })
    db.prepare('INSERT OR REPLACE INTO layout (id, config) VALUES (1, ?)').run(config)
    const row = db.prepare('SELECT config FROM layout WHERE id = 1').get() as { config: string }
    expect(JSON.parse(row.config)).toEqual(JSON.parse(config))
  })

  it('upserts layout config', () => {
    const v1 = JSON.stringify({ narrative: {}, tactical: {} })
    const v2 = JSON.stringify({ narrative: { 'a#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 } }, tactical: {} })
    db.prepare('INSERT OR REPLACE INTO layout (id, config) VALUES (1, ?)').run(v1)
    db.prepare('UPDATE layout SET config = ? WHERE id = 1').run(v2)
    const row = db.prepare('SELECT config FROM layout WHERE id = 1').get() as { config: string }
    expect(JSON.parse(row.config).narrative).toHaveProperty('a#1')
  })
})
