// src/ui-system/__tests__/layoutEngine.test.ts
import { describe, it, expect } from 'vitest'
import {
  anchorBase,
  anchorFactor,
  resizeOriginFactor,
  computeResizeCompensation,
  resolvePosition,
  inferAnchor,
  inferPlacement,
  clampToViewport,
  layerBaseZ,
} from '../layoutEngine'
import type { RegionLayoutEntry } from '../regionTypes'

const VP = { width: 1920, height: 1080 }

function entry(overrides: Partial<RegionLayoutEntry>): RegionLayoutEntry {
  return {
    anchor: 'top-left',
    offsetX: 0,
    offsetY: 0,
    width: 200,
    height: 100,
    zOrder: 0,
    ...overrides,
  }
}

describe('anchorBase', () => {
  const size = { width: 200, height: 100 }

  it('top-left: origin', () => {
    expect(anchorBase('top-left', size, VP)).toEqual({ x: 0, y: 0 })
  })

  it('top-right: flush right', () => {
    expect(anchorBase('top-right', size, VP)).toEqual({ x: 1720, y: 0 })
  })

  it('bottom-left: flush bottom', () => {
    expect(anchorBase('bottom-left', size, VP)).toEqual({ x: 0, y: 980 })
  })

  it('bottom-right: flush bottom-right', () => {
    expect(anchorBase('bottom-right', size, VP)).toEqual({ x: 1720, y: 980 })
  })

  it('center: centered', () => {
    expect(anchorBase('center', size, VP)).toEqual({ x: 860, y: 490 })
  })
})

describe('resolvePosition', () => {
  it('top-left with offset', () => {
    expect(resolvePosition(entry({ anchor: 'top-left', offsetX: 10, offsetY: 20 }), VP)).toEqual({
      x: 10,
      y: 20,
    })
  })

  it('top-right with negative offset', () => {
    expect(resolvePosition(entry({ anchor: 'top-right', offsetX: -10, offsetY: 20 }), VP)).toEqual({
      x: 1710,
      y: 20,
    })
  })

  it('bottom-left with negative offset', () => {
    expect(
      resolvePosition(entry({ anchor: 'bottom-left', offsetX: 10, offsetY: -20 }), VP),
    ).toEqual({ x: 10, y: 960 })
  })

  it('bottom-right with zero offset', () => {
    expect(resolvePosition(entry({ anchor: 'bottom-right', offsetX: 0, offsetY: 0 }), VP)).toEqual({
      x: 1720,
      y: 980,
    })
  })

  it('center with zero offset', () => {
    expect(resolvePosition(entry({ anchor: 'center', offsetX: 0, offsetY: 0 }), VP)).toEqual({
      x: 860,
      y: 490,
    })
  })

  it('center with offset shifts from center', () => {
    expect(resolvePosition(entry({ anchor: 'center', offsetX: 50, offsetY: -30 }), VP)).toEqual({
      x: 910,
      y: 460,
    })
  })
})

describe('inferAnchor', () => {
  it('top-left quadrant', () => {
    expect(inferAnchor({ x: 100, y: 100 }, VP)).toBe('top-left')
  })

  it('top-right quadrant', () => {
    expect(inferAnchor({ x: 1500, y: 100 }, VP)).toBe('top-right')
  })

  it('bottom-left quadrant', () => {
    expect(inferAnchor({ x: 100, y: 800 }, VP)).toBe('bottom-left')
  })

  it('bottom-right quadrant', () => {
    expect(inferAnchor({ x: 1500, y: 800 }, VP)).toBe('bottom-right')
  })

  it('exact center goes to bottom-right (>= threshold)', () => {
    expect(inferAnchor({ x: 960, y: 540 }, VP)).toBe('bottom-right')
  })
})

describe('inferPlacement', () => {
  it('top-left panel infers top-left anchor with correct offset', () => {
    const result = inferPlacement({ x: 100, y: 100, width: 200, height: 100 }, VP)
    expect(result).toEqual({ anchor: 'top-left', offsetX: 100, offsetY: 100 })
  })

  it('top-right panel infers top-right anchor with negative offset', () => {
    const result = inferPlacement({ x: 1700, y: 50, width: 200, height: 100 }, VP)
    expect(result).toEqual({ anchor: 'top-right', offsetX: -20, offsetY: 50 })
  })

  it('round-trips with resolvePosition', () => {
    const rect = { x: 300, y: 700, width: 200, height: 100 }
    const placement = inferPlacement(rect, VP)
    const e = entry({ ...placement, width: 200, height: 100 })
    const pos = resolvePosition(e, VP)
    expect(pos).toEqual({ x: rect.x, y: rect.y })
  })
})

describe('clampToViewport', () => {
  it('no clamping needed when within bounds', () => {
    expect(clampToViewport({ x: 100, y: 100 }, { width: 200, height: 100 }, VP)).toEqual({
      x: 100,
      y: 100,
    })
  })

  it('clamps negative x and y to zero', () => {
    expect(clampToViewport({ x: -50, y: -30 }, { width: 200, height: 100 }, VP)).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('clamps right overflow', () => {
    expect(clampToViewport({ x: 1800, y: 0 }, { width: 200, height: 100 }, VP)).toEqual({
      x: 1720,
      y: 0,
    })
  })

  it('clamps bottom overflow', () => {
    expect(clampToViewport({ x: 0, y: 1050 }, { width: 200, height: 100 }, VP)).toEqual({
      x: 0,
      y: 980,
    })
  })

  it('clamps both axes simultaneously', () => {
    expect(clampToViewport({ x: 2000, y: 2000 }, { width: 200, height: 100 }, VP)).toEqual({
      x: 1720,
      y: 980,
    })
  })
})

describe('anchorFactor', () => {
  it('top-left → (0, 0)', () => {
    expect(anchorFactor('top-left')).toEqual({ x: 0, y: 0 })
  })
  it('top-right → (1, 0)', () => {
    expect(anchorFactor('top-right')).toEqual({ x: 1, y: 0 })
  })
  it('bottom-left → (0, 1)', () => {
    expect(anchorFactor('bottom-left')).toEqual({ x: 0, y: 1 })
  })
  it('bottom-right → (1, 1)', () => {
    expect(anchorFactor('bottom-right')).toEqual({ x: 1, y: 1 })
  })
  it('center → (0.5, 0.5)', () => {
    expect(anchorFactor('center')).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe('resizeOriginFactor', () => {
  it('covers all 9 points', () => {
    expect(resizeOriginFactor('top-left')).toEqual({ x: 0, y: 0 })
    expect(resizeOriginFactor('top-center')).toEqual({ x: 0.5, y: 0 })
    expect(resizeOriginFactor('top-right')).toEqual({ x: 1, y: 0 })
    expect(resizeOriginFactor('center-left')).toEqual({ x: 0, y: 0.5 })
    expect(resizeOriginFactor('center')).toEqual({ x: 0.5, y: 0.5 })
    expect(resizeOriginFactor('center-right')).toEqual({ x: 1, y: 0.5 })
    expect(resizeOriginFactor('bottom-left')).toEqual({ x: 0, y: 1 })
    expect(resizeOriginFactor('bottom-center')).toEqual({ x: 0.5, y: 1 })
    expect(resizeOriginFactor('bottom-right')).toEqual({ x: 1, y: 1 })
  })
})

describe('computeResizeCompensation', () => {
  const small = { width: 44, height: 44 }
  const big = { width: 220, height: 340 }

  it('no compensation when resizeOrigin matches anchor (top-left)', () => {
    const result = computeResizeCompensation(small, big, 'top-left', 'top-left')
    expect(result).toEqual({ dOffsetX: 0, dOffsetY: 0 })
  })

  it('center-left origin with top-left anchor: Y shifts up by half dh', () => {
    const result = computeResizeCompensation(small, big, 'top-left', 'center-left')
    // dh = 296, anchorFactor.y=0, originFactor.y=0.5 → dOffsetY = (0-0.5)*296 = -148
    expect(result).toEqual({ dOffsetX: 0, dOffsetY: -148 })
  })

  it('center origin with top-left anchor: both axes shift', () => {
    const result = computeResizeCompensation(small, big, 'top-left', 'center')
    // dw=176, dh=296
    // dOffsetX = (0-0.5)*176 = -88, dOffsetY = (0-0.5)*296 = -148
    expect(result).toEqual({ dOffsetX: -88, dOffsetY: -148 })
  })

  it('top-right origin with top-right anchor: no compensation', () => {
    const result = computeResizeCompensation(small, big, 'top-right', 'top-right')
    expect(result).toEqual({ dOffsetX: 0, dOffsetY: 0 })
  })

  it('center origin with top-right anchor', () => {
    const result = computeResizeCompensation(small, big, 'top-right', 'center')
    // dw=176, dh=296
    // dOffsetX = (1-0.5)*176 = 88, dOffsetY = (0-0.5)*296 = -148
    expect(result).toEqual({ dOffsetX: 88, dOffsetY: -148 })
  })

  it('shrinking reverses the compensation', () => {
    const result = computeResizeCompensation(big, small, 'top-left', 'center-left')
    // dh = -296 → dOffsetY = (0-0.5)*(-296) = 148
    expect(result).toEqual({ dOffsetX: 0, dOffsetY: 148 })
  })

  it('round-trip: expand then collapse returns to original offset', () => {
    const expand = computeResizeCompensation(small, big, 'top-left', 'center-left')
    const collapse = computeResizeCompensation(big, small, 'top-left', 'center-left')
    expect(expand.dOffsetX + collapse.dOffsetX).toBe(0)
    expect(expand.dOffsetY + collapse.dOffsetY).toBe(0)
  })
})

describe('layerBaseZ', () => {
  it('background = 0', () => {
    expect(layerBaseZ('background')).toBe(0)
  })
  it('standard = 1000', () => {
    expect(layerBaseZ('standard')).toBe(1000)
  })
  it('overlay = 2000', () => {
    expect(layerBaseZ('overlay')).toBe(2000)
  })
})
