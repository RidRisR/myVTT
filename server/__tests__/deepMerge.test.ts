import { describe, it, expect } from 'vitest'
import { deepMerge } from '../deepMerge'

describe('deepMerge', () => {
  // --- Prototype pollution protection ---

  it('__proto__ key in source should NOT pollute Object.prototype', () => {
    const target = { a: 1 }
    const source = JSON.parse('{"__proto__": {"polluted": true}}')
    const result = deepMerge(target, source)

    // Object.prototype must not be polluted
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    // The dangerous key should not appear in the result
    expect(result).toEqual({ a: 1 })
    expect('__proto__' in result).toBe(true) // every object has __proto__, but...
    expect(Object.keys(result)).not.toContain('__proto__')
  })

  it('constructor key in source should be skipped', () => {
    const target = { a: 1 }
    const source = { constructor: { polluted: true } }
    const result = deepMerge(target, source)

    expect(Object.keys(result)).not.toContain('constructor')
    expect(result).toEqual({ a: 1 })
  })

  it('prototype key in source should be skipped', () => {
    const target = { a: 1 }
    const source = { prototype: { polluted: true } }
    const result = deepMerge(target, source)

    expect(Object.keys(result)).not.toContain('prototype')
    expect(result).toEqual({ a: 1 })
  })

  // --- Deep nesting ---

  it('5-level deep nested merge is correct at all levels', () => {
    const target = {
      l1: {
        l2: {
          l3: {
            l4: {
              l5: 'original',
              keep: true,
            },
            keep3: 'yes',
          },
        },
      },
    }
    const source = {
      l1: {
        l2: {
          l3: {
            l4: {
              l5: 'updated',
              added: 42,
            },
          },
        },
      },
    }
    const result = deepMerge(target, source)

    expect(result.l1.l2.l3.l4.l5).toBe('updated')
    expect(result.l1.l2.l3.l4.added).toBe(42)
    expect(result.l1.l2.l3.l4.keep).toBe(true)
    expect(result.l1.l2.l3.keep3).toBe('yes')
  })

  // --- Mixed: top-level override + inner merge ---

  it('top-level primitive override + inner object merge', () => {
    const target = {
      name: 'old',
      nested: { a: 1, b: 2 },
    }
    const source = {
      name: 'new',
      nested: { b: 99, c: 3 },
    }
    const result = deepMerge(target, source)

    expect(result.name).toBe('new')
    expect(result.nested).toEqual({ a: 1, b: 99, c: 3 })
  })

  // --- undefined value ---

  it('undefined value in source should be written (not skipped)', () => {
    const target = { a: 1, b: 'hello' }
    const source = { b: undefined }
    const result = deepMerge(target, source)

    expect(result.a).toBe(1)
    expect(result.b).toBeUndefined()
    expect('b' in result).toBe(true)
  })

  // --- Date/RegExp objects ---

  it('Date object in source is overwritten directly (not deep merged)', () => {
    const date = new Date('2025-01-01')
    const target = { created: { nested: true } }
    const source = { created: date }
    const result = deepMerge(target, source)

    expect(result.created).toBe(date)
    expect(result.created).toBeInstanceOf(Date)
  })

  it('RegExp object in source is overwritten directly (not deep merged)', () => {
    const regex = /test/gi
    const target = { pattern: { nested: true } }
    const source = { pattern: regex }
    const result = deepMerge(target, source)

    expect(result.pattern).toBe(regex)
    expect(result.pattern).toBeInstanceOf(RegExp)
  })

  // --- null target ---

  it('null target returns shallow copy of source', () => {
    const source = { a: 1, b: { c: 2 } }
    const result = deepMerge(null, source)

    expect(result).toEqual({ a: 1, b: { c: 2 } })
    // Should be a copy, not the same reference
    expect(result).not.toBe(source)
    // Shallow copy: nested object IS the same reference
    expect(result.b).toBe(source.b)
  })
})
