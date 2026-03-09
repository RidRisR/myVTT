import { adjustNumericValue } from '../panelUtils'

describe('adjustNumericValue', () => {
  it('decrements HP format', () => {
    expect(adjustNumericValue('15/20', -1)).toBe('14/20')
  })

  it('increments HP format', () => {
    expect(adjustNumericValue('15/20', 1)).toBe('16/20')
  })

  it('clamps HP to 0 (lower bound)', () => {
    expect(adjustNumericValue('0/20', -1)).toBe('0/20')
  })

  it('clamps HP to max (upper bound)', () => {
    expect(adjustNumericValue('20/20', 1)).toBe('20/20')
  })

  it('increments plain number', () => {
    expect(adjustNumericValue('7', 1)).toBe('8')
  })

  it('decrements plain number', () => {
    expect(adjustNumericValue('7', -1)).toBe('6')
  })

  it('clamps plain number to 0', () => {
    expect(adjustNumericValue('0', -1)).toBe('0')
  })

  it('handles large delta on HP', () => {
    expect(adjustNumericValue('5/20', -10)).toBe('0/20')
    expect(adjustNumericValue('5/20', 100)).toBe('20/20')
  })
})
