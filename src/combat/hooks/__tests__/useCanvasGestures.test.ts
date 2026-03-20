import { describe, it, expect } from 'vitest'
import { isPanGesture, isToolGesture, isDragBeyondThreshold } from '../useCanvasGestures'

function makeMouseEvent(button: number): MouseEvent {
  return { button } as MouseEvent
}

// ── isPanGesture ──

describe('isPanGesture', () => {
  it('returns true for right-click (button 2)', () => {
    expect(isPanGesture(makeMouseEvent(2))).toBe(true)
  })

  it('returns false for left-click (button 0)', () => {
    expect(isPanGesture(makeMouseEvent(0))).toBe(false)
  })

  it('returns false for middle-click (button 1)', () => {
    expect(isPanGesture(makeMouseEvent(1))).toBe(false)
  })
})

// ── isToolGesture ──

describe('isToolGesture', () => {
  it('returns true for left-click (button 0)', () => {
    expect(isToolGesture(makeMouseEvent(0))).toBe(true)
  })

  it('returns false for right-click (button 2)', () => {
    expect(isToolGesture(makeMouseEvent(2))).toBe(false)
  })
})

// ── isDragBeyondThreshold ──

describe('isDragBeyondThreshold', () => {
  // Threshold is 5px (euclidean distance)

  it('returns false when no movement', () => {
    expect(isDragBeyondThreshold(100, 100, 100, 100)).toBe(false)
  })

  it('returns false for movement within threshold', () => {
    // 3px right, 3px down → distance = sqrt(9+9) ≈ 4.24 < 5
    expect(isDragBeyondThreshold(0, 0, 3, 3)).toBe(false)
  })

  it('returns false at exactly threshold boundary', () => {
    // 5px right → distance = 5, uses strict > so exactly 5 is false
    expect(isDragBeyondThreshold(0, 0, 5, 0)).toBe(false)
  })

  it('returns true when movement exceeds threshold', () => {
    // 6px right → distance = 6 > 5
    expect(isDragBeyondThreshold(0, 0, 6, 0)).toBe(true)
  })

  it('returns true for diagonal movement beyond threshold', () => {
    // 4px right, 4px down → distance = sqrt(16+16) ≈ 5.66 > 5
    expect(isDragBeyondThreshold(0, 0, 4, 4)).toBe(true)
  })

  it('handles negative direction correctly', () => {
    // -6px left → distance = 6 > 5
    expect(isDragBeyondThreshold(10, 10, 4, 10)).toBe(true)
  })
})
