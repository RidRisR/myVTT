// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { makeEntity } from '../../../src/__test-utils__/fixtures'
import {
  dhGetMainResource,
  dhGetPortraitResources,
  dhGetStatuses,
  dhGetFormulaTokens,
} from '../adapters'
import type { DHRuleData } from '../types'

const makeDHEntity = (overrides?: Partial<DHRuleData>) => {
  const defaults: DHRuleData = {
    agility: 2,
    strength: 1,
    finesse: 3,
    instinct: 0,
    presence: 1,
    knowledge: 2,
    tier: 1,
    proficiency: 1,
    className: 'Ranger',
    ancestry: 'Elf',
    hp: { current: 15, max: 20 },
    stress: { current: 2, max: 6 },
    hope: 3,
    armor: 2,
  }
  return makeEntity({ ruleData: { ...defaults, ...overrides } })
}

describe('dhGetMainResource', () => {
  it('returns null for entity with no ruleData', () => {
    expect(dhGetMainResource(makeEntity({ ruleData: null }))).toBeNull()
  })
  it('returns HP with label and red color', () => {
    const r = dhGetMainResource(makeDHEntity({ hp: { current: 15, max: 20 } }))
    expect(r?.label).toBe('HP')
    expect(r?.current).toBe(15)
    expect(r?.max).toBe(20)
    expect(r?.color).toBe('#ef4444')
  })
})

describe('dhGetPortraitResources', () => {
  it('returns empty array for no ruleData', () => {
    expect(dhGetPortraitResources(makeEntity({ ruleData: null }))).toEqual([])
  })
  it('returns [HP, Stress] in order', () => {
    const r = dhGetPortraitResources(makeDHEntity())
    expect(r).toHaveLength(2)
    expect(r[0]?.label).toBe('HP')
    expect(r[1]?.label).toBe('Stress')
    expect(r[1]?.color).toBe('#f97316')
  })
})

describe('dhGetMainResource — partial ruleData', () => {
  it('returns null when hp is missing from ruleData', () => {
    const entity = makeEntity({ ruleData: { agility: 1 } })
    expect(dhGetMainResource(entity)).toBeNull()
  })
})

describe('dhGetPortraitResources — partial ruleData', () => {
  it('returns empty when hp is missing', () => {
    const entity = makeEntity({ ruleData: { agility: 1 } })
    expect(dhGetPortraitResources(entity)).toEqual([])
  })
  it('returns only HP when stress is missing', () => {
    const entity = makeEntity({ ruleData: { hp: { current: 10, max: 20 } } })
    const r = dhGetPortraitResources(entity)
    expect(r).toHaveLength(1)
    expect(r[0]?.label).toBe('HP')
  })
})

describe('dhGetStatuses', () => {
  it('returns empty array (no status system in v1)', () => {
    expect(dhGetStatuses(makeDHEntity())).toEqual([])
  })
})

describe('dhGetFormulaTokens', () => {
  it('returns empty for no ruleData', () => {
    expect(dhGetFormulaTokens(makeEntity({ ruleData: null }))).toEqual({})
  })
  it('returns 6 attributes + proficiency', () => {
    const tokens = dhGetFormulaTokens(makeDHEntity())
    expect(tokens).toEqual({
      agility: 2,
      strength: 1,
      finesse: 3,
      instinct: 0,
      presence: 1,
      knowledge: 2,
      proficiency: 1,
    })
  })
})
