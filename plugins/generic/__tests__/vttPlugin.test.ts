import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerRenderer,
  clearRenderers,
  getAllRenderers,
} from '../../../src/log/rendererRegistry'
import {
  MAIN_RESOURCE_POINT,
  PORTRAIT_RESOURCES_POINT,
  STATUS_POINT,
  FORMULA_TOKENS_POINT,
  ENTITY_CARD_POINT,
} from '../../../src/log/entityBindings'
import type {
  MainResourceBinding,
  PortraitResourcesBinding,
  StatusBinding,
  FormulaTokensBinding,
  EntityCardBinding,
} from '../../../src/log/entityBindings'
import { makeEntity } from '../../../src/__test-utils__/fixtures'
import { genericVTTPlugin } from '../vttPlugin'

// Minimal SDK mock that delegates registerRenderer to the real registry
const fakeSdk = {
  ui: {
    registerRenderer(point: unknown, value: unknown) {
      registerRenderer(point as never, value as never)
    },
  },
} as Parameters<typeof genericVTTPlugin.onActivate>[0]

beforeEach(() => {
  clearRenderers()
  genericVTTPlugin.onActivate(fakeSdk)
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveMain(components: Record<string, unknown>) {
  const bindings = getAllRenderers(MAIN_RESOURCE_POINT) as MainResourceBinding[]
  const entity = makeEntity({ components })
  for (const b of bindings) {
    const r = b.resolve(entity)
    if (r !== null) return r
  }
  return null
}

function resolvePortrait(components: Record<string, unknown>) {
  const bindings = getAllRenderers(PORTRAIT_RESOURCES_POINT) as PortraitResourcesBinding[]
  const entity = makeEntity({ components })
  return bindings.flatMap((b) => b.resolve(entity))
}

function resolveStatuses(components: Record<string, unknown>) {
  const bindings = getAllRenderers(STATUS_POINT) as StatusBinding[]
  const entity = makeEntity({ components })
  return bindings.flatMap((b) => b.resolve(entity))
}

function resolveFormula(components: Record<string, unknown>) {
  const bindings = getAllRenderers(FORMULA_TOKENS_POINT) as FormulaTokensBinding[]
  const entity = makeEntity({ components })
  let result: Record<string, number> = {}
  for (const b of bindings) {
    result = { ...result, ...b.resolve(entity) }
  }
  return result
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Generic plugin — MAIN_RESOURCE_POINT', () => {
  it('returns first resource when rule:resources is present', () => {
    const r = resolveMain({
      'rule:resources': [
        { current: 5, max: 10, label: 'Mana', color: '#00f' },
        { current: 3, max: 8, label: 'Stamina', color: '#0f0' },
      ],
    })
    expect(r?.label).toBe('Mana')
    expect(r?.current).toBe(5)
  })

  it('returns null when rule:resources is missing', () => {
    expect(resolveMain({})).toBeNull()
  })

  it('returns null when rule:resources is empty array', () => {
    expect(resolveMain({ 'rule:resources': [] })).toBeNull()
  })
})

describe('Generic plugin — PORTRAIT_RESOURCES_POINT', () => {
  it('returns all resources', () => {
    const result = resolvePortrait({
      'rule:resources': [
        { current: 5, max: 10, label: 'Mana', color: '#00f' },
        { current: 3, max: 8, label: 'Stamina', color: '#0f0' },
      ],
    })
    expect(result).toHaveLength(2)
  })

  it('returns empty array when no resources', () => {
    expect(resolvePortrait({})).toEqual([])
  })
})

describe('Generic plugin — STATUS_POINT', () => {
  it('returns statuses when rule:statuses is present', () => {
    const result = resolveStatuses({
      'rule:statuses': [{ label: 'Poisoned', color: '#0f0', icon: '☠' }],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.label).toBe('Poisoned')
  })

  it('returns empty array when no statuses', () => {
    expect(resolveStatuses({})).toEqual([])
  })
})

describe('Generic plugin — FORMULA_TOKENS_POINT', () => {
  it('returns key-value map from rule:attributes', () => {
    const result = resolveFormula({
      'rule:attributes': [
        { key: 'agility', value: 3 },
        { key: 'strength', value: 5 },
      ],
    })
    expect(result).toEqual({ agility: 3, strength: 5 })
  })

  it('returns empty object when no attributes', () => {
    expect(resolveFormula({})).toEqual({})
  })

  it('skips entries with empty key', () => {
    const result = resolveFormula({
      'rule:attributes': [
        { key: '', value: 10 },
        { key: 'dex', value: 2 },
      ],
    })
    expect(result).toEqual({ dex: 2 })
  })

  it('skips entries with non-number value (undefined)', () => {
    const result = resolveFormula({
      'rule:attributes': [
        { key: 'str', value: undefined },
        { key: 'dex', value: 2 },
      ],
    })
    expect(result).toEqual({ dex: 2 })
  })

  it('skips entries with non-number value (string)', () => {
    const result = resolveFormula({
      'rule:attributes': [
        { key: 'str', value: 'abc' },
        { key: 'dex', value: 2 },
      ],
    })
    expect(result).toEqual({ dex: 2 })
  })
})

describe('Generic plugin — ENTITY_CARD_POINT', () => {
  it('registers with ruleSystemId generic', () => {
    const bindings = getAllRenderers(ENTITY_CARD_POINT) as EntityCardBinding[]
    const generic = bindings.find((b) => b.ruleSystemId === 'generic')
    expect(generic).toBeDefined()
    expect(generic?.component).toBeDefined()
  })
})
