import { describe, it, expect } from 'vitest'
import { generateRoomName } from '../randomRoomName'

describe('generateRoomName', () => {
  it('returns a non-empty string', () => {
    const name = generateRoomName()
    expect(name).toBeTruthy()
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })

  it('produces different names across many calls (randomness check)', () => {
    const names = new Set(Array.from({ length: 50 }, () => generateRoomName()))
    // With 20x20=400 combinations, 50 calls should produce at least 10 unique
    expect(names.size).toBeGreaterThanOrEqual(10)
  })
})
