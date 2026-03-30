// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initRoomSchema } from '../schema'
import { createEffectRegistry } from '../effectRegistry'
import type { GameLogEntry } from '../../src/shared/logTypes'

describe('effectRegistry', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    initRoomSchema(db)
  })

  afterEach(() => {
    db.close()
  })

  it('core:tracker-update applies delta and writes snapshot', () => {
    db.prepare('INSERT INTO team_trackers (id, label, current, max) VALUES (?, ?, ?, ?)').run(
      't1',
      'Hope',
      5,
      10,
    )

    const registry = createEffectRegistry()
    const entry = {
      seq: 0,
      id: 'e1',
      type: 'core:tracker-update',
      origin: { seat: { id: 's1', name: 'GM', color: '#fff' } },
      executor: 's1',
      groupId: 'g1',
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      baseSeq: 0,
      timestamp: Date.now(),
      payload: { trackerId: 't1', delta: -2 },
    } as GameLogEntry

    registry.run(db, entry)

    const row = db.prepare('SELECT current FROM team_trackers WHERE id = ?').get('t1') as {
      current: number
    }
    expect(row.current).toBe(3)
    expect(entry.payload.snapshot).toBeDefined()
    expect((entry.payload.snapshot as { current: number }).current).toBe(3)
  })

  it('core:component-update replaces component data', () => {
    db.prepare('INSERT INTO entities (id) VALUES (?)').run('ent1')
    db.prepare(
      'INSERT INTO entity_components (entity_id, component_key, data) VALUES (?, ?, ?)',
    ).run('ent1', 'dh:health', JSON.stringify({ current: 10, max: 20 }))

    const registry = createEffectRegistry()
    const entry = {
      seq: 0,
      id: 'e2',
      type: 'core:component-update',
      origin: { seat: { id: 's1', name: 'GM', color: '#fff' } },
      executor: 's1',
      groupId: 'g1',
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      baseSeq: 0,
      timestamp: Date.now(),
      payload: { entityId: 'ent1', key: 'dh:health', data: { current: 5, max: 20 } },
    } as GameLogEntry

    registry.run(db, entry)

    const row = db
      .prepare('SELECT data FROM entity_components WHERE entity_id = ? AND component_key = ?')
      .get('ent1', 'dh:health') as { data: string }
    expect(JSON.parse(row.data)).toEqual({ current: 5, max: 20 })
  })

  it('unknown type is a no-op', () => {
    const registry = createEffectRegistry()
    const entry = {
      type: 'core:text',
      payload: { content: 'hello' },
    } as unknown as GameLogEntry
    registry.run(db, entry)
  })

  it('core:tracker-update supports label-based format (deprecated ctx.updateTeamTracker)', () => {
    db.prepare('INSERT INTO team_trackers (id, label, current, max) VALUES (?, ?, ?, ?)').run(
      't1',
      'Hope',
      5,
      10,
    )

    const registry = createEffectRegistry()
    const entry = {
      seq: 0,
      id: 'e3',
      type: 'core:tracker-update',
      origin: { seat: { id: 's1', name: 'GM', color: '#fff' } },
      executor: 's1',
      groupId: 'g1',
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      baseSeq: 0,
      timestamp: Date.now(),
      payload: { label: 'Hope', current: 8 },
    } as GameLogEntry

    registry.run(db, entry)

    const row = db.prepare('SELECT current FROM team_trackers WHERE id = ?').get('t1') as {
      current: number
    }
    expect(row.current).toBe(8)
    expect(entry.payload.snapshot).toBeDefined()
    expect((entry.payload.snapshot as { current: number }).current).toBe(8)
  })

  it('custom handler can be registered', () => {
    const registry = createEffectRegistry()
    let called = false
    registry.register('custom:test', () => {
      called = true
    })
    registry.run(db, { type: 'custom:test', payload: {} } as unknown as GameLogEntry)
    expect(called).toBe(true)
  })
})
