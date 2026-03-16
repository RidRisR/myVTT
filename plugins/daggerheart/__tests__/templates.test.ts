// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createDefaultDHEntityData } from '../templates'

describe('createDefaultDHEntityData', () => {
  it('returns valid DHRuleData with all fields zeroed', () => {
    const d = createDefaultDHEntityData()
    expect(d.agility).toBe(0)
    expect(d.tier).toBe(1)
    expect(d.proficiency).toBe(1)
    expect(d.className).toBe('')
    expect(d.hp).toEqual({ current: 0, max: 0 })
    expect(d.hope).toBe(0)
  })
  it('returns new object on each call', () => {
    const a = createDefaultDHEntityData()
    const b = createDefaultDHEntityData()
    a.agility = 99
    expect(b.agility).toBe(0)
  })
})
