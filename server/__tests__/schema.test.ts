// server/__tests__/schema.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initRoomSchema, initGlobalSchema } from '../schema'
import { toCamel, toCamelAll, parseJsonFields } from '../db'
import { deepMerge } from '../deepMerge'

describe('initGlobalSchema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })
  afterEach(() => {
    db.close()
  })

  it('creates rooms table', () => {
    initGlobalSchema(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string
    }[]
    expect(tables.map((t) => t.name)).toContain('rooms')
  })

  it('is idempotent', () => {
    initGlobalSchema(db)
    initGlobalSchema(db)
    const count = db.prepare('SELECT COUNT(*) as c FROM rooms').get() as { c: number }
    expect(count.c).toBe(0)
  })
})

describe('initRoomSchema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
  })
  afterEach(() => {
    db.close()
  })

  it('creates all expected tables', () => {
    initRoomSchema(db)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain('room_state')
    expect(names).toContain('seats')
    expect(names).toContain('scenes')
    expect(names).toContain('entities')
    expect(names).toContain('scene_entities')
    expect(names).toContain('archives')
    expect(names).toContain('archive_tokens')
    expect(names).toContain('tactical_state')
    expect(names).toContain('tactical_tokens')
    expect(names).toContain('assets')
    expect(names).toContain('showcase_items')
    expect(names).toContain('blueprints')
    expect(names).toContain('game_log')
  })

  it('initializes singleton rows', () => {
    initRoomSchema(db)
    const roomState = db.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<
      string,
      unknown
    >
    expect(roomState).toBeTruthy()
    expect(roomState.active_scene_id).toBeNull()
    // tactical_mode now lives in tactical_state (per-scene), not room_state
    expect(roomState.plugin_config).toBe('{}')
  })

  it('creates game_log table with expected columns', () => {
    initRoomSchema(db)
    const columns = db.pragma('table_info(game_log)') as { name: string }[]
    const colNames = columns.map((c) => c.name)
    expect(colNames).toEqual([
      'seq',
      'id',
      'type',
      'origin',
      'executor',
      'parent_id',
      'group_id',
      'chain_depth',
      'triggerable',
      'visibility',
      'base_seq',
      'payload',
      'timestamp',
    ])
  })

  it('enforces entities.blueprint_id ON DELETE SET NULL', () => {
    initRoomSchema(db)
    db.prepare("INSERT INTO blueprints (id, created_at) VALUES ('bp1', 1)").run()
    db.prepare("INSERT INTO entities (id, blueprint_id) VALUES ('e1', 'bp1')").run()

    db.prepare("DELETE FROM blueprints WHERE id = 'bp1'").run()
    const entity = db.prepare("SELECT blueprint_id FROM entities WHERE id = 'e1'").get() as {
      blueprint_id: string | null
    }
    expect(entity.blueprint_id).toBeNull()
  })

  it('enforces scene_entities foreign key cascade', () => {
    initRoomSchema(db)
    db.prepare("INSERT INTO scenes (id, name) VALUES ('s1', 'Test')").run()
    db.prepare("INSERT INTO entities (id) VALUES ('e1')").run()
    db.prepare("INSERT INTO scene_entities (scene_id, entity_id) VALUES ('s1', 'e1')").run()

    // Delete scene → scene_entities should cascade
    db.prepare("DELETE FROM scenes WHERE id = 's1'").run()
    const remaining = db.prepare('SELECT COUNT(*) as c FROM scene_entities').get() as { c: number }
    expect(remaining.c).toBe(0)
  })
})

describe('toCamel', () => {
  it('converts snake_case to camelCase', () => {
    const result = toCamel<{ imageUrl: string; sortOrder: number }>({
      image_url: 'test.png',
      sort_order: 3,
    })
    expect(result.imageUrl).toBe('test.png')
    expect(result.sortOrder).toBe(3)
  })

  it('leaves already camelCase keys unchanged', () => {
    const result = toCamel<{ name: string }>({ name: 'foo' })
    expect(result.name).toBe('foo')
  })
})

describe('toCamelAll', () => {
  it('converts array of rows', () => {
    const rows = [
      { id: '1', sort_order: 0 },
      { id: '2', sort_order: 1 },
    ]
    const result = toCamelAll<{ id: string; sortOrder: number }>(rows)
    expect(result).toHaveLength(2)
    expect(result[0]!.sortOrder).toBe(0)
    expect(result[1]!.sortOrder).toBe(1)
  })
})

describe('parseJsonFields', () => {
  it('parses specified JSON string fields', () => {
    const row = { id: '1', atmosphere: '{"imageUrl":"bg.png"}', name: 'test' }
    const result = parseJsonFields(row, 'atmosphere')
    expect(result.atmosphere).toEqual({ imageUrl: 'bg.png' })
    expect(result.name).toBe('test')
  })

  it('leaves non-string fields as-is', () => {
    const row = { id: '1', atmosphere: { already: 'parsed' } }
    const result = parseJsonFields(row, 'atmosphere')
    expect(result.atmosphere).toEqual({ already: 'parsed' })
  })
})

describe('deepMerge', () => {
  it('merges flat objects', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 })
  })

  it('deep merges nested objects', () => {
    expect(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3, z: 4 } })).toEqual({
      a: { x: 1, y: 3, z: 4 },
    })
  })

  it('handles null/undefined target', () => {
    expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 })
    expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 })
  })

  it('overwrites arrays (no array merge)', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
  })

  it('handles empty source', () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 })
  })

  it('does not mutate inputs', () => {
    const target = { a: { b: 1 } }
    const source = { a: { c: 2 } }
    const result = deepMerge(target, source)
    expect(result).toEqual({ a: { b: 1, c: 2 } })
    expect(target).toEqual({ a: { b: 1 } })
    expect(source).toEqual({ a: { c: 2 } })
  })
})
