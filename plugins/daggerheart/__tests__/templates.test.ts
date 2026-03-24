// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createDefaultDHEntityData } from '../templates'
import { DH_KEYS } from '../types'
import type { DHHealth, DHAttributes, DHMeta, DHExtras } from '../types'

describe('createDefaultDHEntityData', () => {
  it('returns valid component-keyed data with all fields zeroed', () => {
    const d = createDefaultDHEntityData()
    const attrs = d[DH_KEYS.attributes] as DHAttributes
    const meta = d[DH_KEYS.meta] as DHMeta
    const hp = d[DH_KEYS.health] as DHHealth
    const extras = d[DH_KEYS.extras] as DHExtras
    expect(attrs.agility).toBe(0)
    expect(meta.tier).toBe(1)
    expect(meta.proficiency).toBe(1)
    expect(meta.className).toBe('')
    expect(hp).toEqual({ current: 0, max: 0 })
    expect(extras.hope).toBe(0)
  })
  it('returns new object on each call', () => {
    const a = createDefaultDHEntityData()
    const b = createDefaultDHEntityData()
    ;(a[DH_KEYS.attributes] as DHAttributes).agility = 99
    expect((b[DH_KEYS.attributes] as DHAttributes).agility).toBe(0)
  })
})
