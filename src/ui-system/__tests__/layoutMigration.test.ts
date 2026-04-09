// src/ui-system/__tests__/layoutMigration.test.ts
import { describe, it, expect } from 'vitest'
import { isLegacyEntry, migrateLayoutEntry, migrateLayoutConfig } from '../layoutMigration'
import { resolvePosition } from '../layoutEngine'
import type { RegionLayoutEntry } from '../regionTypes'

const VP = { width: 1920, height: 1080 }

describe('isLegacyEntry', () => {
  it('detects legacy {x, y} entry', () => {
    expect(isLegacyEntry({ x: 10, y: 20, width: 200, height: 100, zOrder: 0 })).toBe(true)
  })

  it('rejects new {anchor} entry', () => {
    expect(
      isLegacyEntry({
        anchor: 'top-left',
        offsetX: 10,
        offsetY: 20,
        width: 200,
        height: 100,
        zOrder: 0,
      }),
    ).toBe(false)
  })

  it('rejects null', () => {
    expect(isLegacyEntry(null)).toBe(false)
  })

  it('rejects non-object', () => {
    expect(isLegacyEntry('hello')).toBe(false)
  })
})

describe('migrateLayoutEntry', () => {
  it('migrates top-left panel correctly', () => {
    const old = { x: 100, y: 100, width: 200, height: 100, zOrder: 5 }
    const result = migrateLayoutEntry(old, VP)
    expect(result).toEqual({
      anchor: 'top-left',
      offsetX: 100,
      offsetY: 100,
      width: 200,
      height: 100,
      zOrder: 5,
      visible: undefined,
      instanceProps: undefined,
    })
  })

  it('migrates top-right panel with negative offset', () => {
    const old = { x: 1700, y: 50, width: 200, height: 100, zOrder: 0 }
    const result = migrateLayoutEntry(old, VP)
    expect(result.anchor).toBe('top-right')
    expect(result.offsetX).toBe(-20)
    expect(result.offsetY).toBe(50)
  })

  it('round-trips: resolvePosition(migrated) returns original {x, y}', () => {
    const old = { x: 300, y: 700, width: 200, height: 100, zOrder: 1 }
    const migrated = migrateLayoutEntry(old, VP)
    const pos = resolvePosition(migrated, VP)
    expect(pos).toEqual({ x: 300, y: 700 })
  })

  it('preserves visible and serializable instanceProps', () => {
    const old = {
      x: 50,
      y: 50,
      width: 200,
      height: 100,
      zOrder: 0,
      visible: false,
      instanceProps: { spellId: 'fireball' },
    }
    const result = migrateLayoutEntry(old, VP)
    expect(result.visible).toBe(false)
    expect(result.instanceProps).toEqual({ spellId: 'fireball' })
  })

  it('drops function instanceProps', () => {
    const old = {
      x: 50,
      y: 50,
      width: 200,
      height: 100,
      zOrder: 0,
      instanceProps: () => ({ foo: 1 }),
    }
    const result = migrateLayoutEntry(old, VP)
    expect(result.instanceProps).toBeUndefined()
  })
})

describe('migrateLayoutConfig', () => {
  it('migrates all entries in a config', () => {
    const config = {
      'core-ui.session-info#1': { x: 1700, y: 60, width: 200, height: 260, zOrder: 0 },
      'daggerheart-core:fear-panel#1': { x: 100, y: 100, width: 160, height: 120, zOrder: 1 },
    }
    const result = migrateLayoutConfig(config, VP)
    expect(Object.keys(result)).toEqual(Object.keys(config))
    expect(result['core-ui.session-info#1']!.anchor).toBeDefined()
    expect(result['daggerheart-core:fear-panel#1']!.anchor).toBeDefined()
  })

  it('skips already-migrated entries', () => {
    const config = {
      'migrated#1': {
        anchor: 'center' as const,
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    const result = migrateLayoutConfig(config as Record<string, unknown>, VP)
    expect(result['migrated#1']).toEqual(config['migrated#1'])
  })
})
