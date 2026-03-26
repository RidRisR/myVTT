// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { shouldReceive } from '../visibility'
import type { Visibility } from '../../src/shared/logTypes'

describe('shouldReceive', () => {
  it('public ({}) → everyone receives', () => {
    expect(shouldReceive({}, 'seat-1', 'PL')).toBe(true)
    expect(shouldReceive({}, null, null)).toBe(true)
  })
  it('include whitelist → only listed seats', () => {
    const vis: Visibility = { include: ['seat-1', 'seat-3'] }
    expect(shouldReceive(vis, 'seat-1', 'PL')).toBe(true)
    expect(shouldReceive(vis, 'seat-2', 'PL')).toBe(false)
    expect(shouldReceive(vis, 'seat-3', 'GM')).toBe(true)
  })
  it('exclude blacklist → everyone except listed', () => {
    const vis: Visibility = { exclude: ['seat-5'] }
    expect(shouldReceive(vis, 'seat-1', 'PL')).toBe(true)
    expect(shouldReceive(vis, 'seat-5', 'PL')).toBe(false)
  })
  it('GM role always receives when include has "gm"', () => {
    const vis: Visibility = { include: ['gm', 'seat-1'] }
    expect(shouldReceive(vis, 'seat-99', 'GM')).toBe(true)
    expect(shouldReceive(vis, 'seat-99', 'PL')).toBe(false)
  })
  it('null seatId → only public entries', () => {
    expect(shouldReceive({ include: ['seat-1'] }, null, null)).toBe(false)
  })
})
