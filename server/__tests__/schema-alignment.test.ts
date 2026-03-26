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
    db.prepare("INSERT INTO entities (id) VALUES ('perm-test')").run()
    const row = db.prepare("SELECT permissions FROM entities WHERE id = 'perm-test'").get() as {
      permissions: string
    }
    expect(JSON.parse(row.permissions)).toEqual({ default: 'none', seats: {} })
  })

  it('assets table has category column defaulting to map', () => {
    db.prepare(
      "INSERT INTO assets (id, url, created_at) VALUES ('cat-test', '/img.png', 1000)",
    ).run()
    const row = db.prepare("SELECT category FROM assets WHERE id = 'cat-test'").get() as {
      category: string
    }
    expect(row.category).toBe('map')
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

  it('room_state singleton row (id=1) exists after schema init', () => {
    const row = db.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<string, unknown>
    expect(row).toBeTruthy()
    expect(row.id).toBe(1)
    expect(row.active_scene_id).toBeNull()
    expect(row.plugin_config).toBe('{}')
    // tactical_mode now lives in tactical_state (per-scene)
  })

  it('FK cascade: delete scene removes scene_entities rows', () => {
    db.prepare("INSERT INTO scenes (id, name) VALUES ('fk-s1', 'Tavern')").run()
    db.prepare("INSERT INTO entities (id) VALUES ('fk-e1')").run()
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

  it('has index on entities(lifecycle)', () => {
    const indexes = db.prepare("PRAGMA index_list('entities')").all() as { name: string }[]
    const indexNames = indexes.map((i) => i.name)
    expect(indexNames.some((n) => n.includes('lifecycle'))).toBe(true)
  })

  it('FK cascade: delete entity removes scene_entities rows', () => {
    db.prepare("INSERT INTO scenes (id, name) VALUES ('fk-s2', 'Dungeon')").run()
    db.prepare("INSERT INTO entities (id) VALUES ('fk-e2')").run()
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
