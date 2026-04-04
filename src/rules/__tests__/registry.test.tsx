// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import { getAvailablePlugins } from '../registry'
import { makeEntity } from '../../__test-utils__/fixtures'
import {
  getMainResource,
  getPortraitResources,
  getStatuses,
  getFormulaTokens,
} from '../../log/entityBindings'

// Importing registry triggers plugin activation (registerWorkflowPlugins)
// which registers entity bindings. This test verifies the integration.

describe('getAvailablePlugins', () => {
  it('returns at least generic and daggerheart', () => {
    const plugins = getAvailablePlugins()
    const ids = plugins.map((p) => p.id)
    expect(ids).toContain('generic')
    expect(ids).toContain('daggerheart')
  })

  it('returns id and name for each entry', () => {
    for (const plugin of getAvailablePlugins()) {
      expect(plugin.id).toBeTruthy()
      expect(plugin.name).toBeTruthy()
    }
  })
})

describe('entity bindings — adapter safety contract', () => {
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
      expect(() => getMainResource(makeEntity({ components }))).not.toThrow()
    })
    it(`getPortraitResources does not crash with ${label}`, () => {
      expect(() => getPortraitResources(makeEntity({ components }))).not.toThrow()
    })
    it(`getStatuses does not crash with ${label}`, () => {
      expect(() => getStatuses(makeEntity({ components }))).not.toThrow()
    })
    it(`getFormulaTokens does not crash with ${label}`, () => {
      expect(() => getFormulaTokens(makeEntity({ components }))).not.toThrow()
    })
  }
})
