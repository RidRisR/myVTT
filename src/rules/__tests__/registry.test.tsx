// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ToastProvider } from '../../ui/ToastProvider'
import { getRulePlugin, getAvailablePlugins, registerPlugin } from '../registry'
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
  it('getMainResource returns null for entity with no resources', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity()
    expect(plugin.adapters.getMainResource(entity)).toBeNull()
  })

  it('getMainResource returns first resource from generic:resources component', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({
      components: {
        'core:identity': { name: 'Test', imageUrl: '', color: '#3b82f6' },
        'generic:resources': [{ label: 'hp', current: 15, max: 20, color: '#f00' }],
      },
    })
    const resource = plugin.adapters.getMainResource(entity)
    expect(resource).not.toBeNull()
    expect(resource?.current).toBe(15)
    expect(resource?.max).toBe(20)
    expect(resource?.color).toBe('#f00')
    expect(resource?.label).toBe('hp')
  })

  it('getStatuses returns status labels', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({
      components: {
        'core:identity': { name: 'Test', imageUrl: '', color: '#3b82f6' },
        'generic:statuses': [{ label: 'Poisoned' }, { label: 'Stunned' }],
      },
    })
    const statuses = plugin.adapters.getStatuses(entity)
    expect(statuses).toHaveLength(2)
    expect(statuses[0]?.label).toBe('Poisoned')
  })

  it('getPortraitResources returns all resources', () => {
    const plugin = getRulePlugin('generic')
    const entity = makeEntity({
      components: {
        'core:identity': { name: 'Test', imageUrl: '', color: '#3b82f6' },
        'generic:resources': [
          { label: 'hp', current: 10, max: 20, color: '#f00' },
          { label: 'mp', current: 5, max: 10, color: '#00f' },
        ],
      },
    })
    const resources = plugin.adapters.getPortraitResources(entity)
    expect(resources).toHaveLength(2)
    expect(resources[0]?.label).toBe('hp')
  })
})

// ── Base-level contract: all plugins must handle edge-case components without crashing ──

const allPluginIds = getAvailablePlugins().map((p) => p.id)

describe.each(allPluginIds)('%s plugin — adapter safety contract', (pluginId) => {
  const plugin = getRulePlugin(pluginId)

  const edgeCases = [
    { label: 'empty components', components: {} },
    {
      label: 'core-only components',
      components: { 'core:identity': { name: 'x', imageUrl: '', color: '' } },
    },
    { label: 'unrelated components', components: { 'foo:bar': { baz: 1 } } },
  ]

  for (const { label, components } of edgeCases) {
    it(`getMainResource does not crash with ${label}`, () => {
      expect(() => plugin.adapters.getMainResource(makeEntity({ components }))).not.toThrow()
    })
    it(`getPortraitResources does not crash with ${label}`, () => {
      expect(() => plugin.adapters.getPortraitResources(makeEntity({ components }))).not.toThrow()
    })
    it(`getStatuses does not crash with ${label}`, () => {
      expect(() => plugin.adapters.getStatuses(makeEntity({ components }))).not.toThrow()
    })
    it(`getFormulaTokens does not crash with ${label}`, () => {
      expect(() => plugin.adapters.getFormulaTokens(makeEntity({ components }))).not.toThrow()
    })
  }
})

// ── Base-level contract: EntityCard must not crash with edge-case components ──

describe.each(allPluginIds)('%s plugin — EntityCard render safety', (pluginId) => {
  const plugin = getRulePlugin(pluginId)
  const { EntityCard } = plugin.characterUI

  afterEach(cleanup)

  const edgeCases = [
    { label: 'empty components', components: {} },
    {
      label: 'core-only components',
      components: { 'core:identity': { name: 'x', imageUrl: '', color: '' } },
    },
    { label: 'unrelated components', components: { 'foo:bar': { baz: 1 } } },
  ]

  for (const { label, components } of edgeCases) {
    it(`does not crash with ${label}`, () => {
      expect(() =>
        render(
          <ToastProvider>
            <EntityCard entity={makeEntity({ components })} onUpdate={vi.fn()} readonly />
          </ToastProvider>,
        ),
      ).not.toThrow()
    })
  }
})
