import { getEntityResources, getEntityAttributes, getEntityStatuses } from '../entityAdapters'
import { makeEntity } from '../../__test-utils__/fixtures'

// ── getEntityResources ──────────────────────────────────────────

describe('getEntityResources', () => {
  it('returns [] for null entity', () => {
    expect(getEntityResources(null)).toEqual([])
  })

  it('returns [] when ruleData is null', () => {
    expect(getEntityResources(makeEntity({ ruleData: null }))).toEqual([])
  })

  it('returns [] when ruleData has no resources', () => {
    expect(getEntityResources(makeEntity({ ruleData: {} }))).toEqual([])
  })

  it('passes through array format', () => {
    const resources = [{ key: 'hp', current: 15, max: 20, color: '#f00' }]
    const entity = makeEntity({ ruleData: { resources } })
    expect(getEntityResources(entity)).toEqual(resources)
  })

  it('converts object format with "cur" key', () => {
    const entity = makeEntity({
      ruleData: { resources: { hp: { cur: 15, max: 20, color: '#f00' } } },
    })
    expect(getEntityResources(entity)).toEqual([{ key: 'hp', current: 15, max: 20, color: '#f00' }])
  })

  it('converts object format with "current" key', () => {
    const entity = makeEntity({
      ruleData: { resources: { hp: { current: 10, max: 20, color: '#0f0' } } },
    })
    expect(getEntityResources(entity)).toEqual([{ key: 'hp', current: 10, max: 20, color: '#0f0' }])
  })

  it('uses defaults for missing fields', () => {
    const entity = makeEntity({
      ruleData: { resources: { mp: {} } },
    })
    expect(getEntityResources(entity)).toEqual([
      { key: 'mp', current: 0, max: 0, color: '#3b82f6' },
    ])
  })
})

// ── getEntityAttributes ─────────────────────────────────────────

describe('getEntityAttributes', () => {
  it('returns [] for null entity', () => {
    expect(getEntityAttributes(null)).toEqual([])
  })

  it('returns [] when no attributes', () => {
    expect(getEntityAttributes(makeEntity({ ruleData: {} }))).toEqual([])
  })

  it('passes through array format', () => {
    const attributes = [{ key: 'str', value: 18 }]
    const entity = makeEntity({ ruleData: { attributes } })
    expect(getEntityAttributes(entity)).toEqual(attributes)
  })

  it('converts plain number values', () => {
    const entity = makeEntity({ ruleData: { attributes: { str: 10 } } })
    expect(getEntityAttributes(entity)).toEqual([{ key: 'str', value: 10, category: undefined }])
  })

  it('converts object values with category', () => {
    const entity = makeEntity({
      ruleData: { attributes: { str: { value: 18, category: 'ability' } } },
    })
    expect(getEntityAttributes(entity)).toEqual([{ key: 'str', value: 18, category: 'ability' }])
  })
})

// ── getEntityStatuses ───────────────────────────────────────────

describe('getEntityStatuses', () => {
  it('returns [] for null entity', () => {
    expect(getEntityStatuses(null)).toEqual([])
  })

  it('returns [] when no statuses', () => {
    expect(getEntityStatuses(makeEntity({ ruleData: {} }))).toEqual([])
  })

  it('returns statuses array', () => {
    const statuses = [{ label: 'Poisoned' }, { label: 'Stunned' }]
    const entity = makeEntity({ ruleData: { statuses } })
    expect(getEntityStatuses(entity)).toEqual(statuses)
  })
})
