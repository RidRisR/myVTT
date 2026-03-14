// src/stores/__tests__/selectors.test.ts
// Tests for selector referential stability — prevents zustand infinite re-render bugs.
// Selectors used with useStore(selector) MUST return the same reference (Object.is)
// when the underlying data has not changed.

import { describe, it, expect } from 'vitest'
import {
  selectTokens,
  selectActiveScene,
  selectIsCombat,
  selectEntityById,
  selectTokenById,
  selectRoom,
  selectScenes,
  selectEntities,
  selectCombatInfo,
  selectActiveSceneId,
  selectSpeakerEntities,
} from '../selectors'
import type { Entity } from '../../shared/entityTypes'

const makeEntity = (id: string, overrides?: Partial<Entity>): Entity => ({
  id,
  name: `Entity ${id}`,
  imageUrl: '',
  color: '#fff',
  size: 1,
  notes: '',
  lifecycle: 'ephemeral' as const,
  ruleData: {},
  permissions: { default: 'none', seats: {} },
  ...overrides,
})

describe('selector referential stability', () => {
  it('selectTokens returns same reference across calls when combatInfo is null', () => {
    const state = { combatInfo: null }
    const a = selectTokens(state)
    const b = selectTokens(state)
    expect(a).toBe(b) // Object.is, not deep equal
  })

  it('selectTokens returns same reference across calls when combatInfo exists', () => {
    const tokens = { t1: { id: 't1', x: 0, y: 0, size: 1, color: '#fff' } }
    const state = {
      combatInfo: {
        mapUrl: null,
        mapWidth: null,
        mapHeight: null,
        grid: { size: 50, snap: true, visible: true, color: '#fff', offsetX: 0, offsetY: 0 },
        tokens,
        initiativeOrder: [],
        initiativeIndex: 0,
      },
    }
    const a = selectTokens(state)
    const b = selectTokens(state)
    expect(a).toBe(b) // same tokens object reference
  })

  it('selectActiveScene returns null stably when no active scene', () => {
    const state = { room: { activeSceneId: null, activeEncounterId: null }, scenes: [] }
    const a = selectActiveScene(state)
    const b = selectActiveScene(state)
    expect(a).toBe(null)
    expect(a).toBe(b)
  })

  it('selectActiveScene returns same scene object when found', () => {
    const scene = {
      id: 's1',
      name: 'Test',
      sortOrder: 0,
      gmOnly: false,
      atmosphere: {
        imageUrl: '',
        width: 0,
        height: 0,
        particlePreset: 'none',
        ambientPreset: 'none',
        ambientAudioUrl: '',
        ambientAudioVolume: 0.5,
      },
    }
    const state = {
      room: { activeSceneId: 's1', activeEncounterId: null },
      scenes: [scene],
    }
    const a = selectActiveScene(state)
    const b = selectActiveScene(state)
    expect(a).toBe(b) // same scene object
  })

  it('selectIsCombat returns primitive (always stable)', () => {
    const state = { room: { activeSceneId: null, activeEncounterId: null } }
    expect(selectIsCombat(state)).toBe(false)
    expect(selectIsCombat({ room: { activeSceneId: null, activeEncounterId: 'e1' } })).toBe(true)
  })

  it('selectEntityById(null) returns null stably', () => {
    const selector = selectEntityById(null)
    const state = { entities: {} }
    expect(selector(state)).toBe(null)
    expect(selector(state)).toBe(null)
  })

  it('selectTokenById(null) returns null stably', () => {
    const selector = selectTokenById(null)
    const state = { combatInfo: null }
    expect(selector(state)).toBe(null)
    expect(selector(state)).toBe(null)
  })

  // ── Additional stability tests (Bug #1 regression coverage) ──

  it('selectRoom returns same reference when state is unchanged', () => {
    const room = { activeSceneId: 's1', activeEncounterId: null }
    const state = { room }
    expect(selectRoom(state)).toBe(selectRoom(state))
  })

  it('selectScenes returns same reference when state is unchanged', () => {
    const scenes = [{ id: 's1', name: 'Test', sortOrder: 0, gmOnly: false, atmosphere: {} }]
    const state = { scenes }
    expect(selectScenes(state)).toBe(selectScenes(state))
  })

  it('selectEntities returns same reference when state is unchanged', () => {
    const entities = { e1: makeEntity('e1') }
    const state = { entities }
    expect(selectEntities(state)).toBe(selectEntities(state))
  })

  it('selectCombatInfo returns null stably', () => {
    const state = { combatInfo: null }
    expect(selectCombatInfo(state)).toBe(null)
    expect(selectCombatInfo(state)).toBe(selectCombatInfo(state))
  })

  it('selectActiveSceneId returns same primitive across calls', () => {
    const state = { room: { activeSceneId: 'abc', activeEncounterId: null } }
    expect(selectActiveSceneId(state)).toBe('abc')
    expect(selectActiveSceneId(state)).toBe(selectActiveSceneId(state))
  })

  it('selectEntityById returns same entity across calls when found', () => {
    const entity = makeEntity('e1')
    const state = { entities: { e1: entity } }
    const selector = selectEntityById('e1')
    expect(selector(state)).toBe(entity)
    expect(selector(state)).toBe(selector(state))
  })

  it('selectEntityById returns null stably for missing id', () => {
    const state = { entities: {} }
    const selector = selectEntityById('missing')
    expect(selector(state)).toBe(null)
    expect(selector(state)).toBe(selector(state))
  })

  it('selectTokenById returns same token across calls when found', () => {
    const token = { id: 't1', x: 10, y: 20, size: 1, color: '#f00' }
    const state = {
      combatInfo: {
        mapUrl: null,
        mapWidth: null,
        mapHeight: null,
        grid: { size: 50, snap: true, visible: true, color: '#fff', offsetX: 0, offsetY: 0 },
        tokens: { t1: token },
        initiativeOrder: [],
        initiativeIndex: 0,
      },
    }
    const selector = selectTokenById('t1')
    expect(selector(state)).toBe(token)
    expect(selector(state)).toBe(selector(state))
  })
})

describe('selectSpeakerEntities', () => {
  const entities: Record<string, Entity> = {
    e1: makeEntity('e1', { permissions: { default: 'none', seats: { seat1: 'owner' } } }),
    e2: makeEntity('e2', { permissions: { default: 'none', seats: { seat2: 'owner' } } }),
    e3: makeEntity('e3', { permissions: { default: 'none', seats: {} } }),
  }

  it('GM sees all entities', () => {
    const result = selectSpeakerEntities(entities, 'seat1', true)
    expect(result).toHaveLength(3)
  })

  it('PL sees only owned entities', () => {
    const result = selectSpeakerEntities(entities, 'seat1', false)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e1')
  })

  it('PL with no seat sees nothing', () => {
    const result = selectSpeakerEntities(entities, null, false)
    expect(result).toHaveLength(0)
  })

  it('PL with no owned entities sees nothing', () => {
    const result = selectSpeakerEntities(entities, 'seat99', false)
    expect(result).toHaveLength(0)
  })
})
