// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { getRulePlugin, registerPlugin } from '../registry'
import { makeEntity } from '../../__test-utils__/fixtures'

describe('getRulePlugin', () => {
  it('returns generic plugin for "generic" id', () => {
    const plugin = getRulePlugin('generic')
    expect(plugin.id).toBe('generic')
    expect(plugin.sdkVersion).toBe('1')
  })

  it('falls back to generic for unknown id', () => {
    const plugin = getRulePlugin('unknown-system')
    expect(plugin.id).toBe('generic')
  })

  it('returns registered plugin after registerPlugin()', () => {
    const fakePlugin = {
      id: 'test-system',
      name: 'Test',
      sdkVersion: '1' as const,
      adapters: {
        getMainResource: () => null,
        getPortraitResources: () => [],
        getStatuses: () => [],
        getFormulaTokens: () => ({}),
      },
      characterUI: { EntityCard: () => null },
    }
    registerPlugin(fakePlugin)
    expect(getRulePlugin('test-system').id).toBe('test-system')
  })
})

describe('genericPlugin adapters', () => {
  it('getMainResource returns null for entity with no ruleData', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({ ruleData: null })
    expect(plugin.adapters.getMainResource(entity)).toBeNull()
  })

  it('getMainResource returns first resource from ruleData', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({
      ruleData: {
        resources: { hp: { current: 15, max: 20, color: '#f00' } },
      },
    })
    const resource = plugin.adapters.getMainResource(entity)
    expect(resource).not.toBeNull()
    expect(resource!.current).toBe(15)
    expect(resource!.max).toBe(20)
    expect(resource!.color).toBe('#f00')
    expect(resource!.label).toBe('hp')
  })

  it('getStatuses returns status labels', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({
      ruleData: { statuses: [{ label: 'Poisoned' }, { label: 'Stunned' }] },
    })
    const statuses = plugin.adapters.getStatuses(entity)
    expect(statuses).toHaveLength(2)
    expect(statuses[0].label).toBe('Poisoned')
  })

  it('getPortraitResources returns all resources', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({
      ruleData: {
        resources: [
          { key: 'hp', current: 10, max: 20, color: '#f00' },
          { key: 'mp', current: 5, max: 10, color: '#00f' },
        ],
      },
    })
    const resources = plugin.adapters.getPortraitResources(entity)
    expect(resources).toHaveLength(2)
    expect(resources[0].label).toBe('hp')
  })
})

describe('daggerheartPlugin registration', () => {
  it('getRulePlugin returns daggerheart after registration', () => {
    const plugin = getRulePlugin('daggerheart')
    expect(plugin.id).toBe('daggerheart')
  })
  it('daggerheart adapters.getMainResource returns HP', () => {
    const plugin = getRulePlugin('daggerheart')
    const entity = makeEntity({
      ruleData: {
        agility: 2,
        strength: 1,
        finesse: 3,
        instinct: 0,
        presence: 1,
        knowledge: 2,
        tier: 1,
        proficiency: 1,
        className: 'R',
        ancestry: 'E',
        hp: { current: 12, max: 20 },
        stress: { current: 0, max: 6 },
        hope: 2,
        armor: 1,
      },
    })
    expect(plugin.adapters.getMainResource(entity)!.current).toBe(12)
  })
  it('daggerheart diceSystem.evaluateRoll works', () => {
    const plugin = getRulePlugin('daggerheart')
    const r = plugin.diceSystem!.evaluateRoll([[8, 5]], 15)
    expect(r?.type).toBe('daggerheart')
  })
  it('daggerheart surfaces.rollCardRenderers has daggerheart:dd', () => {
    const plugin = getRulePlugin('daggerheart')
    expect(plugin.surfaces?.rollCardRenderers?.['daggerheart:dd']).toBeDefined()
  })
})
