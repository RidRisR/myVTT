// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { makeEntity } from '../../../src/__test-utils__/fixtures'
import {
  dhGetMainResource,
  dhGetPortraitResources,
  dhGetStatuses,
  dhGetFormulaTokens,
} from '../adapters'
import type { DHHealth, DHStress, DHAttributes, DHMeta, DHExtras } from '../types'
import { DH_KEYS } from '../types'

const makeDHEntity = (overrides?: Record<string, unknown>) => {
  const defaults: Record<string, unknown> = {
    [DH_KEYS.health]: { current: 15, max: 20 } satisfies DHHealth,
    [DH_KEYS.stress]: { current: 2, max: 6 } satisfies DHStress,
    [DH_KEYS.attributes]: {
      agility: 2,
      strength: 1,
      finesse: 3,
      instinct: 0,
      presence: 1,
      knowledge: 2,
    } satisfies DHAttributes,
    [DH_KEYS.meta]: {
      tier: 1,
      proficiency: 1,
      className: 'Ranger',
      ancestry: 'Elf',
    } satisfies DHMeta,
    [DH_KEYS.extras]: { hope: 3, hopeMax: 6, armor: 2, armorMax: 4 } satisfies DHExtras,
  }
  return makeEntity({
    components: {
      'core:identity': { name: 'Test Character', imageUrl: '', color: '#3b82f6' },
      'core:token': { width: 1, height: 1 },
      'core:notes': { text: '' },
      ...defaults,
      ...overrides,
    },
  })
}

describe('dhGetMainResource', () => {
  it('returns null for entity with no health component', () => {
    expect(dhGetMainResource(makeEntity())).toBeNull()
  })
  it('returns HP with label and red color', () => {
    const r = dhGetMainResource(makeDHEntity({ [DH_KEYS.health]: { current: 15, max: 20 } }))
    expect(r?.label).toBe('HP')
    expect(r?.current).toBe(15)
    expect(r?.max).toBe(20)
    expect(r?.color).toBe('#ef4444')
  })
})

describe('dhGetPortraitResources', () => {
  it('returns empty array for no health component', () => {
    expect(dhGetPortraitResources(makeEntity())).toEqual([])
  })
  it('returns [HP, Stress] in order', () => {
    const r = dhGetPortraitResources(makeDHEntity())
    expect(r).toHaveLength(2)
    expect(r[0]?.label).toBe('HP')
    expect(r[1]?.label).toBe('Stress')
    expect(r[1]?.color).toBe('#f97316')
  })
})

describe('dhGetStatuses', () => {
  it('returns empty array (no status system in v1)', () => {
    expect(dhGetStatuses(makeDHEntity())).toEqual([])
  })
})

describe('dhGetFormulaTokens', () => {
  it('returns empty for no attributes component', () => {
    expect(dhGetFormulaTokens(makeEntity())).toEqual({})
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
