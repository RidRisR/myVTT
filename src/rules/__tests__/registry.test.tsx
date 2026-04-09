// @vitest-environment jsdom
import { describe, it, expect, afterAll } from 'vitest'
import { getAvailablePlugins } from '../registry'
import { makeEntity } from '../../__test-utils__/fixtures'
import {
  getMainResource,
  getPortraitResources,
  getStatuses,
  getFormulaTokens,
  getEntityCard,
  getDataTemplate,
} from '../../log/entityBindings'
import { initWorkflowSystem, resetWorkflowEngine } from '../../workflow/useWorkflowSDK'
import { clearRenderers } from '../../log/rendererRegistry'

// Importing registry calls registerWorkflowPlugins (stores plugins).
// initWorkflowSystem activates them with a real PluginSDK that wires
// registerRenderer to the global RendererRegistry.
initWorkflowSystem()

afterAll(() => {
  resetWorkflowEngine()
  clearRenderers()
})

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

describe('entity bindings — return value correctness (DH)', () => {
  const dhEntity = makeEntity({
    components: {
      'core:identity': { name: 'DH Hero', imageUrl: '', color: '#3b82f6' },
      'daggerheart:health': { current: 15, max: 20 },
      'daggerheart:stress': { current: 2, max: 6 },
      'daggerheart:attributes': {
        agility: 2,
        strength: 1,
        finesse: 3,
        instinct: 0,
        presence: 1,
        knowledge: 2,
      },
      'daggerheart:meta': { tier: 1, proficiency: 1, className: 'Ranger', ancestry: 'Elf' },
    },
  })

  it('getMainResource returns HP for DH entity', () => {
    const r = getMainResource(dhEntity)
    expect(r).not.toBeNull()
    expect(r?.label).toBe('HP')
    expect(r?.current).toBe(15)
    expect(r?.max).toBe(20)
    expect(r?.color).toBe('#ef4444')
  })

  it('getPortraitResources returns HP + Stress for DH entity', () => {
    const resources = getPortraitResources(dhEntity)
    expect(resources.length).toBeGreaterThanOrEqual(2)
    expect(resources.find((r) => r.label === 'HP')).toBeDefined()
    expect(resources.find((r) => r.label === 'Stress')).toBeDefined()
  })

  it('getFormulaTokens returns 6 attributes + proficiency for DH entity', () => {
    const tokens = getFormulaTokens(dhEntity)
    expect(tokens.agility).toBe(2)
    expect(tokens.strength).toBe(1)
    expect(tokens.proficiency).toBe(1)
  })
})

describe('entity bindings — return value correctness (Generic)', () => {
  const genericEntity = makeEntity({
    components: {
      'core:identity': { name: 'Generic Hero', imageUrl: '', color: '#3b82f6' },
      'rule:resources': [{ current: 5, max: 10, label: 'Mana', color: '#00f' }],
      'rule:attributes': [
        { key: 'dex', value: 3 },
        { key: 'str', value: 5 },
      ],
    },
  })

  it('getMainResource returns first resource for generic entity', () => {
    const r = getMainResource(genericEntity)
    expect(r).not.toBeNull()
    expect(r?.label).toBe('Mana')
    expect(r?.current).toBe(5)
  })

  it('getFormulaTokens returns attribute map for generic entity', () => {
    const tokens = getFormulaTokens(genericEntity)
    expect(tokens).toEqual({ dex: 3, str: 5 })
  })
})

describe('entity bindings — room-level lookups', () => {
  it('getEntityCard returns component for daggerheart', () => {
    expect(getEntityCard('daggerheart')).not.toBeNull()
  })

  it('getEntityCard returns component for generic', () => {
    expect(getEntityCard('generic')).not.toBeNull()
  })

  it('getEntityCard returns null for unknown system', () => {
    expect(getEntityCard('nonexistent')).toBeNull()
  })

  it('getDataTemplate returns factory for daggerheart', () => {
    const factory = getDataTemplate('daggerheart')
    expect(factory).toBeDefined()
    const data = factory?.()
    expect(data).toBeDefined()
    expect(data).toHaveProperty('daggerheart:health')
  })

  it('getDataTemplate returns undefined for unknown system', () => {
    expect(getDataTemplate('nonexistent')).toBeUndefined()
  })

})
