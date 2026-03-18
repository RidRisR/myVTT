import { describe, it, expect } from 'vitest'
import { randomName, ADJECTIVES, NOUNS } from '../SeatSelect'

describe('randomName', () => {
  it('returns "Adj Adj Noun" format', () => {
    for (let i = 0; i < 50; i++) {
      const name = randomName()
      const parts = name.split(' ')
      expect(parts).toHaveLength(3)
      expect(ADJECTIVES).toContain(parts[0])
      expect(ADJECTIVES).toContain(parts[1])
      expect(NOUNS).toContain(parts[2])
    }
  })

  it('produces varied results', () => {
    const results = new Set(Array.from({ length: 30 }, () => randomName()))
    expect(results.size).toBeGreaterThan(1)
  })
})
