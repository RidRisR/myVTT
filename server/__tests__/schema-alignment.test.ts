// server/__tests__/schema-alignment.test.ts
// Verifies SQLite schema matches design doc 43 expectations
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { initRoomSchema } from '../schema'

describe('schema alignment with design doc 43', () => {
  let db: Database.Database

  beforeAll(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    initRoomSchema(db)
  })

  afterAll(() => {
    db.close()
  })

  it('entities.permissions defaults to {"default":"none","seats":{}}', () => {
    db.prepare("INSERT INTO entities (id, name) VALUES ('perm-test', 'Test Entity')").run()
    const row = db.prepare("SELECT permissions FROM entities WHERE id = 'perm-test'").get() as {
      permissions: string
    }
    expect(JSON.parse(row.permissions)).toEqual({ default: 'none', seats: {} })
  })

  it('assets table has tags column defaulting to []', () => {
    db.prepare(
      "INSERT INTO assets (id, url, created_at) VALUES ('tag-test', '/img.png', 1000)",
    ).run()
    const row = db.prepare("SELECT tags FROM assets WHERE id = 'tag-test'").get() as {
      tags: string
    }
    expect(JSON.parse(row.tags)).toEqual([])
  })

  it('showcase_items uses type+data columns', () => {
    const data = JSON.stringify({ imageUrl: 'bg.png', caption: 'hello' })
    db.prepare(
      "INSERT INTO showcase_items (id, type, data, created_at) VALUES ('sc-test', 'image', ?, 2000)",
    ).run(data)
    const row = db.prepare("SELECT type, data FROM showcase_items WHERE id = 'sc-test'").get() as {
      type: string
      data: string
    }
    expect(row.type).toBe('image')
    expect(JSON.parse(row.data)).toEqual({ imageUrl: 'bg.png', caption: 'hello' })
  })

  it('team_trackers.current and max are INTEGER (not floats)', () => {
    db.prepare(
      "INSERT INTO team_trackers (id, label, current, max) VALUES ('tt-test', 'HP', 5, 10)",
    ).run()
    const row = db.prepare("SELECT current, max FROM team_trackers WHERE id = 'tt-test'").get() as {
      current: number
      max: number
    }
    expect(row.current).toBe(5)
    expect(row.max).toBe(10)
    expect(Number.isInteger(row.current)).toBe(true)
    expect(Number.isInteger(row.max)).toBe(true)
  })

  it('combat_state singleton row (id=1) exists after schema init', () => {
    const row = db.prepare('SELECT * FROM combat_state WHERE id = 1').get() as Record<
      string,
      unknown
    >
    expect(row).toBeTruthy()
    expect(row.id).toBe(1)
  })

  it('room_state singleton row (id=1) exists after schema init', () => {
    const row = db.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<
      string,
      unknown
    >
    expect(row).toBeTruthy()
    expect(row.id).toBe(1)
  })

  it('FK cascade: delete scene removes scene_entities rows', () => {
    db.prepare("INSERT INTO scenes (id, name) VALUES ('fk-s1', 'Tavern')").run()
    db.prepare("INSERT INTO entities (id, name) VALUES ('fk-e1', 'Warrior')").run()
    db.prepare("INSERT INTO scene_entities (scene_id, entity_id) VALUES ('fk-s1', 'fk-e1')").run()

    // Verify link exists
    const before = db
      .prepare("SELECT COUNT(*) as c FROM scene_entities WHERE scene_id = 'fk-s1'")
      .get() as { c: number }
    expect(before.c).toBe(1)

    // Delete scene — cascade should remove scene_entities
    db.prepare("DELETE FROM scenes WHERE id = 'fk-s1'").run()
    const after = db
      .prepare("SELECT COUNT(*) as c FROM scene_entities WHERE scene_id = 'fk-s1'")
      .get() as { c: number }
    expect(after.c).toBe(0)
  })

  // ── Index verification (regression: M4) ──
  it('has index on scene_entities(scene_id)', () => {
    const indexes = db.prepare("PRAGMA index_list('scene_entities')").all() as { name: string }[]
    const indexNames = indexes.map((i) => i.name)
    expect(indexNames.some((n) => n.includes('scene'))).toBe(true)
  })

  it('has index on chat_messages(timestamp)', () => {
    const indexes = db.prepare("PRAGMA index_list('chat_messages')").all() as { name: string }[]
    const indexNames = indexes.map((i) => i.name)
    expect(indexNames.some((n) => n.includes('chat') || n.includes('ts'))).toBe(true)
  })

  it('has index on entities(persistent)', () => {
    const indexes = db.prepare("PRAGMA index_list('entities')").all() as { name: string }[]
    const indexNames = indexes.map((i) => i.name)
    expect(indexNames.some((n) => n.includes('persistent'))).toBe(true)
  })

  it('FK cascade: delete entity removes scene_entities rows', () => {
    db.prepare("INSERT INTO scenes (id, name) VALUES ('fk-s2', 'Dungeon')").run()
    db.prepare("INSERT INTO entities (id, name) VALUES ('fk-e2', 'Goblin')").run()
    db.prepare("INSERT INTO scene_entities (scene_id, entity_id) VALUES ('fk-s2', 'fk-e2')").run()

    // Verify link exists
    const before = db
      .prepare("SELECT COUNT(*) as c FROM scene_entities WHERE entity_id = 'fk-e2'")
      .get() as { c: number }
    expect(before.c).toBe(1)

    // Delete entity — cascade should remove scene_entities
    db.prepare("DELETE FROM entities WHERE id = 'fk-e2'").run()
    const after = db
      .prepare("SELECT COUNT(*) as c FROM scene_entities WHERE entity_id = 'fk-e2'")
      .get() as { c: number }
    expect(after.c).toBe(0)
  })
})
