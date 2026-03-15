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
  })
})
