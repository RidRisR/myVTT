import { describe, it, expect } from 'vitest'
import { relativeTime } from '../relativeTime'

describe('relativeTime', () => {
  it('returns "just now" for timestamps less than 1 minute ago', () => {
    expect(relativeTime(Date.now())).toBe('just now')
    expect(relativeTime(Date.now() - 30_000)).toBe('just now')
  })

  it('returns minutes for timestamps 1-59 minutes ago', () => {
    expect(relativeTime(Date.now() - 5 * 60_000)).toBe('5m ago')
    expect(relativeTime(Date.now() - 59 * 60_000)).toBe('59m ago')
  })

  it('returns hours for timestamps 1-23 hours ago', () => {
    expect(relativeTime(Date.now() - 2 * 3600_000)).toBe('2h ago')
    expect(relativeTime(Date.now() - 23 * 3600_000)).toBe('23h ago')
  })

  it('returns days for timestamps 1-29 days ago', () => {
    expect(relativeTime(Date.now() - 3 * 86400_000)).toBe('3d ago')
    expect(relativeTime(Date.now() - 29 * 86400_000)).toBe('29d ago')
  })

  it('returns months for timestamps 30+ days ago', () => {
    expect(relativeTime(Date.now() - 60 * 86400_000)).toBe('2mo ago')
    expect(relativeTime(Date.now() - 365 * 86400_000)).toBe('12mo ago')
  })
})
