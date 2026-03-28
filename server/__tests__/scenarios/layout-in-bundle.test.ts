import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initRoomSchema } from '../../schema'

describe('layout in bundle', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initRoomSchema(db)
  })

  it('layout table returns default config', () => {
    const row = db.prepare('SELECT config FROM layout WHERE id = 1').get() as { config: string }
    const config = JSON.parse(row.config) as {
      narrative: Record<string, unknown>
      tactical: Record<string, unknown>
    }
    expect(config.narrative).toEqual({})
    expect(config.tactical).toEqual({})
  })

  it('layout table returns saved config', () => {
    const saved = JSON.stringify({
      narrative: { 'chat#1': { x: 10, y: 20, width: 300, height: 400, zOrder: 0 } },
      tactical: {},
    })
    db.prepare('UPDATE layout SET config = ? WHERE id = 1').run(saved)
    const row = db.prepare('SELECT config FROM layout WHERE id = 1').get() as { config: string }
    expect(JSON.parse(row.config).narrative).toHaveProperty('chat#1')
  })
})
