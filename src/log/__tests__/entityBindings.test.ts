import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerRenderer,
  clearRenderers,
} from '../rendererRegistry'
import {
  MAIN_RESOURCE_POINT,
  PORTRAIT_RESOURCES_POINT,
  STATUS_POINT,
  FORMULA_TOKENS_POINT,
  ENTITY_CARD_POINT,
  DATA_TEMPLATE_POINT,
  TEAM_PANEL_POINT,
  getMainResource,
  getPortraitResources,
  getStatuses,
  getFormulaTokens,
  getEntityCard,
  getDataTemplate,
  getTeamPanel,
} from '../entityBindings'
import { makeEntity } from '../../__test-utils__/fixtures'

beforeEach(() => {
  clearRenderers()
})

// ── Entity-level bindings (resolve per entity) ──────────────────────────────

describe('getMainResource', () => {
  it('returns null when no bindings registered', () => {
    expect(getMainResource(makeEntity())).toBeNull()
  })

  it('returns first non-null result', () => {
    registerRenderer(MAIN_RESOURCE_POINT, {
      resolve: () => null,
    })
    registerRenderer(MAIN_RESOURCE_POINT, {
      resolve: () => ({ current: 5, max: 10, label: 'HP', color: '#f00' }),
    })
    const result = getMainResource(makeEntity())
    expect(result).toEqual({ current: 5, max: 10, label: 'HP', color: '#f00' })
  })

  it('returns null if all bindings resolve to null', () => {
    registerRenderer(MAIN_RESOURCE_POINT, { resolve: () => null })
    registerRenderer(MAIN_RESOURCE_POINT, { resolve: () => null })
    expect(getMainResource(makeEntity())).toBeNull()
  })
})

describe('getPortraitResources', () => {
  it('returns empty array when no bindings registered', () => {
    expect(getPortraitResources(makeEntity())).toEqual([])
  })

  it('unions results from multiple bindings', () => {
    registerRenderer(PORTRAIT_RESOURCES_POINT, {
      resolve: () => [{ current: 5, max: 10, label: 'HP', color: '#f00' }],
    })
    registerRenderer(PORTRAIT_RESOURCES_POINT, {
      resolve: () => [{ current: 2, max: 6, label: 'Stress', color: '#fa0' }],
    })
    const result = getPortraitResources(makeEntity())
    expect(result).toHaveLength(2)
    expect(result[0]?.label).toBe('HP')
    expect(result[1]?.label).toBe('Stress')
  })

  it('returns empty when all bindings return empty arrays', () => {
    registerRenderer(PORTRAIT_RESOURCES_POINT, { resolve: () => [] })
    expect(getPortraitResources(makeEntity())).toEqual([])
  })
})

describe('getStatuses', () => {
  it('returns empty array when no bindings registered', () => {
    expect(getStatuses(makeEntity())).toEqual([])
  })

  it('unions results from multiple bindings', () => {
    registerRenderer(STATUS_POINT, {
      resolve: () => [{ label: 'Poisoned', color: '#0f0', icon: '☠' }],
    })
    registerRenderer(STATUS_POINT, {
      resolve: () => [{ label: 'Blessed', color: '#ff0', icon: '✨' }],
    })
    const result = getStatuses(makeEntity())
    expect(result).toHaveLength(2)
  })
})

describe('getFormulaTokens', () => {
  it('returns empty object when no bindings registered', () => {
    expect(getFormulaTokens(makeEntity())).toEqual({})
  })

  it('merges results from multiple bindings', () => {
    registerRenderer(FORMULA_TOKENS_POINT, {
      resolve: () => ({ agility: 2, strength: 1 }),
    })
    registerRenderer(FORMULA_TOKENS_POINT, {
      resolve: () => ({ proficiency: 1 }),
    })
    expect(getFormulaTokens(makeEntity())).toEqual({
      agility: 2,
      strength: 1,
      proficiency: 1,
    })
  })

  it('later binding overwrites earlier binding on same key', () => {
    registerRenderer(FORMULA_TOKENS_POINT, {
      resolve: () => ({ agility: 2 }),
    })
    registerRenderer(FORMULA_TOKENS_POINT, {
      resolve: () => ({ agility: 5 }),
    })
    expect(getFormulaTokens(makeEntity())).toEqual({ agility: 5 })
  })
})

// ── Room-level bindings (lookup by ruleSystemId) ────────────────────────────

describe('getEntityCard', () => {
  const FakeCard = () => null

  it('returns null when no bindings registered', () => {
    expect(getEntityCard('daggerheart')).toBeNull()
  })

  it('returns component matching ruleSystemId', () => {
    registerRenderer(ENTITY_CARD_POINT, {
      ruleSystemId: 'daggerheart',
      component: FakeCard,
    })
    expect(getEntityCard('daggerheart')).toBe(FakeCard)
  })

  it('returns null for non-matching ruleSystemId', () => {
    registerRenderer(ENTITY_CARD_POINT, {
      ruleSystemId: 'daggerheart',
      component: FakeCard,
    })
    expect(getEntityCard('generic')).toBeNull()
  })
})

describe('getDataTemplate', () => {
  const factory = () => ({ 'dh:health': { current: 0, max: 0 } })

  it('returns undefined when no bindings registered', () => {
    expect(getDataTemplate('daggerheart')).toBeUndefined()
  })

  it('returns factory matching ruleSystemId', () => {
    registerRenderer(DATA_TEMPLATE_POINT, {
      ruleSystemId: 'daggerheart',
      createDefaultEntityData: factory,
    })
    expect(getDataTemplate('daggerheart')).toBe(factory)
    expect(getDataTemplate('daggerheart')?.()).toEqual({ 'dh:health': { current: 0, max: 0 } })
  })

  it('returns undefined for non-matching ruleSystemId', () => {
    registerRenderer(DATA_TEMPLATE_POINT, {
      ruleSystemId: 'daggerheart',
      createDefaultEntityData: factory,
    })
    expect(getDataTemplate('generic')).toBeUndefined()
  })
})

describe('getTeamPanel', () => {
  const FakePanel = () => null

  it('returns null when no bindings registered', () => {
    expect(getTeamPanel('daggerheart')).toBeNull()
  })

  it('returns component matching ruleSystemId', () => {
    registerRenderer(TEAM_PANEL_POINT, {
      ruleSystemId: 'daggerheart',
      component: FakePanel,
    })
    expect(getTeamPanel('daggerheart')).toBe(FakePanel)
  })

  it('returns null for non-matching ruleSystemId', () => {
    registerRenderer(TEAM_PANEL_POINT, {
      ruleSystemId: 'daggerheart',
      component: FakePanel,
    })
    expect(getTeamPanel('generic')).toBeNull()
  })
})
