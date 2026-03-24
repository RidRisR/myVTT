import { describe, it, expect } from 'vitest'
import { output } from './helpers'

describe('output() helper', () => {
  it('picks specified keys from vars', () => {
    const extractor = output<{ a: number; b: string }>('a', 'b')
    const result = extractor({ a: 1, b: 'hello', c: true })
    expect(result).toEqual({ a: 1, b: 'hello' })
  })

  it('ignores extra keys in vars', () => {
    const extractor = output<{ x: number }>('x')
    const result = extractor({ x: 42, y: 99, z: 'extra' })
    expect(result).toEqual({ x: 42 })
  })

  it('returns empty object when no keys specified', () => {
    const extractor = output<Record<string, never>>()
    const result = extractor({ a: 1, b: 2 })
    expect(result).toEqual({})
  })

  it('throws when a key is missing from vars', () => {
    const extractor = output<{ a: number; b: string }>('a', 'b')
    expect(() => extractor({ a: 1 })).toThrow('output(): key "b" not found in workflow vars')
  })

  it('includes keys with undefined values (key exists but value is undefined)', () => {
    const extractor = output<{ a: number | undefined }>('a')
    const result = extractor({ a: undefined })
    expect(result).toEqual({ a: undefined })
  })
})
