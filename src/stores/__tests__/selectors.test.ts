// src/stores/__tests__/selectors.test.ts
// Tests for selector referential stability — prevents zustand infinite re-render bugs.
// Selectors used with useStore(selector) MUST return the same reference (Object.is)
// when the underlying data has not changed.

import { describe, it, expect } from 'vitest'
import {
  selectTokens,
  selectActiveScene,
  selectIsTactical,
  selectEntityById,
  selectTokenById,
  selectRoom,
  selectScenes,
  selectEntities,
  selectTacticalInfo,
  selectActiveSceneId,
  selectSpeakerEntities,
} from '../selectors'
import type { Atmosphere, Entity, MapToken } from '../../shared/entityTypes'
import type { Scene, TacticalInfo } from '../worldStore'

const makeEntity = (id: string, overrides?: Partial<Entity>): Entity => ({
  id,
  name: `Entity ${id}`,
  imageUrl: '',
  color: '#fff',
  width: 1,
  height: 1,
  notes: '',
  lifecycle: 'ephemeral' as const,
  ruleData: {},
  permissions: { default: 'none', seats: {} },
  ...overrides,
})

describe('selector referential stability', () => {
  it('selectTokens returns same reference across calls when tacticalInfo is null', () => {
    const state = { tacticalInfo: null }
    const a = selectTokens(state)
    const b = selectTokens(state)
    expect(a).toBe(b) // Object.is, not deep equal
  })

  it('selectTokens returns same reference across calls when tacticalInfo exists', () => {
    const tokens: MapToken[] = [
      {
        id: 't1',
        entityId: 'e1',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        imageScaleX: 1,
        imageScaleY: 1,
      },
    ]
    const state = {
      tacticalInfo: {
        sceneId: 'scene-1',
        mapUrl: null,
        mapWidth: null,
        mapHeight: null,
        grid: { size: 50, snap: true, visible: true, color: '#fff', offsetX: 0, offsetY: 0 },
        tokens,
        roundNumber: 0,
        currentTurnTokenId: null,
        tacticalMode: 1,
        activeArchiveId: null,
      },
    }
    const a = selectTokens(state)
    const b = selectTokens(state)
    expect(a).toBe(b) // same tokens array reference
  })

  it('selectActiveScene returns null stably when no active scene', () => {
    const state = {
      room: {
        activeSceneId: null,
        ruleSystemId: 'generic',
      },
      scenes: [],
    }
    const a = selectActiveScene(state)
    const b = selectActiveScene(state)
    expect(a).toBe(null)
    expect(a).toBe(b)
  })

  it('selectActiveScene returns same scene object when found', () => {
    const scene: Scene = {
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
      room: {
        activeSceneId: 's1',
        ruleSystemId: 'generic',
      },
      scenes: [scene],
    }
    const a = selectActiveScene(state)
    const b = selectActiveScene(state)
    expect(a).toBe(b) // same scene object
  })

  it('selectIsTactical returns primitive (always stable)', () => {
    expect(selectIsTactical({ tacticalInfo: null })).toBe(false)
    expect(
      selectIsTactical({
        tacticalInfo: { tacticalMode: 1 } as TacticalInfo,
      }),
    ).toBe(true)
  })

  it('selectEntityById(null) returns null stably', () => {
    const selector = selectEntityById(null)
    const state = { entities: {} }
    expect(selector(state)).toBe(null)
    expect(selector(state)).toBe(null)
  })

  it('selectTokenById(null) returns null stably', () => {
    const selector = selectTokenById(null)
    const state = { tacticalInfo: null }
    expect(selector(state)).toBe(null)
    expect(selector(state)).toBe(null)
  })

  // ── Additional stability tests (Bug #1 regression coverage) ──

  it('selectRoom returns same reference when state is unchanged', () => {
    const room = {
      activeSceneId: 's1',
      ruleSystemId: 'generic',
    }
    const state = { room }
    expect(selectRoom(state)).toBe(selectRoom(state))
  })

  it('selectScenes returns same reference when state is unchanged', () => {
    const scenes = [
      { id: 's1', name: 'Test', sortOrder: 0, gmOnly: false, atmosphere: {} as Atmosphere },
    ]
    const state = { scenes }
    expect(selectScenes(state)).toBe(selectScenes(state))
  })

  it('selectEntities returns same reference when state is unchanged', () => {
    const entities = { e1: makeEntity('e1') }
    const state = { entities }
    expect(selectEntities(state)).toBe(selectEntities(state))
  })

  it('selectTacticalInfo returns null stably', () => {
    const state = { tacticalInfo: null }
    expect(selectTacticalInfo(state)).toBe(null)
    expect(selectTacticalInfo(state)).toBe(selectTacticalInfo(state))
  })

  it('selectActiveSceneId returns same primitive across calls', () => {
    const state = {
      room: {
        activeSceneId: 'abc',
        ruleSystemId: 'generic',
      },
    }
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
    const token: MapToken = {
      id: 't1',
      entityId: 'e1',
      x: 10,
      y: 20,
      width: 1,
      height: 1,
      imageScaleX: 1,
      imageScaleY: 1,
    }
    const state = {
      tacticalInfo: {
        sceneId: 'scene-1',
        mapUrl: null,
        mapWidth: null,
        mapHeight: null,
        grid: { size: 50, snap: true, visible: true, color: '#fff', offsetX: 0, offsetY: 0 },
        tokens: [token],
        roundNumber: 0,
        currentTurnTokenId: null,
        tacticalMode: 1,
        activeArchiveId: null,
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
    expect(result[0]?.id).toBe('e1')
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
