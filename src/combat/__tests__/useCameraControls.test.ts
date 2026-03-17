// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { useCameraControls } from '../hooks/useCameraControls'
import type { TacticalInfo } from '../../stores/worldStore'

const CONTAINER = { width: 1000, height: 800 }

function makeTacticalInfo(overrides?: Partial<TacticalInfo>): TacticalInfo {
  return {
    sceneId: 'scene-1',
    mapUrl: null,
    mapWidth: 800,
    mapHeight: 600,
    grid: {
      size: 50,
      snap: true,
      visible: true,
      color: 'rgba(255,255,255,0.15)',
      offsetX: 0,
      offsetY: 0,
    },
    tokens: [],
    roundNumber: 0,
    currentTurnTokenId: null,
    tacticalMode: 1,
    ...overrides,
  }
}

describe('useCameraControls', () => {
  // ── Initial state ──────────────────────────────────────────────

  it('starts with stageScale=1 and stagePos={x:0,y:0}', () => {
    const { result } = renderHook(() =>
      useCameraControls({ tacticalInfo: null, containerSize: CONTAINER }),
    )
    expect(result.current.stageScale).toBe(1)
    expect(result.current.stagePos).toEqual({ x: 0, y: 0 })
  })

  // ── handleZoomIn ───────────────────────────────────────────────

  it('handleZoomIn increases stageScale above 1', () => {
    const { result } = renderHook(() =>
      useCameraControls({ tacticalInfo: null, containerSize: CONTAINER }),
    )
    act(() => {
      result.current.handleZoomIn()
    })
    expect(result.current.stageScale).toBeGreaterThan(1)
  })

  // ── handleZoomOut ──────────────────────────────────────────────

  it('handleZoomOut decreases stageScale after a zoomIn', () => {
    const { result } = renderHook(() =>
      useCameraControls({ tacticalInfo: null, containerSize: CONTAINER }),
    )
    act(() => {
      result.current.handleZoomIn()
    })
    const scaledUp = result.current.stageScale
    act(() => {
      result.current.handleZoomOut()
    })
    expect(result.current.stageScale).toBeLessThan(scaledUp)
  })

  // ── handleResetCenter ──────────────────────────────────────────

  it('handleResetCenter resets stageScale to 1', () => {
    const { result } = renderHook(() =>
      useCameraControls({
        tacticalInfo: makeTacticalInfo({ mapWidth: 800, mapHeight: 600 }),
        containerSize: CONTAINER,
      }),
    )
    // First zoom in so scale is not 1
    act(() => {
      result.current.handleZoomIn()
    })
    expect(result.current.stageScale).not.toBe(1)

    act(() => {
      result.current.handleResetCenter()
    })
    expect(result.current.stageScale).toBe(1)
  })

  it('handleResetCenter centers the map in the container', () => {
    // mapWidth=800, mapHeight=600, container 1000x800
    // expectedX = (1000 - 800) / 2 = 100
    // expectedY = (800 - 600) / 2 = 100
    const { result } = renderHook(() =>
      useCameraControls({
        tacticalInfo: makeTacticalInfo({ mapWidth: 800, mapHeight: 600 }),
        containerSize: CONTAINER,
      }),
    )
    act(() => {
      result.current.handleResetCenter()
    })
    expect(result.current.stagePos).toEqual({ x: 100, y: 100 })
  })

  it('handleResetCenter resets scale to 1 and centers even when tacticalInfo is null', () => {
    const { result } = renderHook(() =>
      useCameraControls({ tacticalInfo: null, containerSize: CONTAINER }),
    )
    act(() => {
      result.current.handleZoomIn()
    })
    expect(result.current.stageScale).not.toBe(1)
    act(() => {
      result.current.handleResetCenter()
    })
    // With null tacticalInfo, mapWidth/mapHeight default to 0
    // so position = (containerWidth/2, containerHeight/2)
    expect(result.current.stageScale).toBe(1)
    expect(result.current.stagePos).toEqual({ x: 500, y: 400 })
  })

  // ── handleFitToWindow ──────────────────────────────────────────

  it('handleFitToWindow sets scale to ~0.95 * min(scaleX, scaleY)', () => {
    // mapWidth=800, mapHeight=600, container 1000x800
    // scaleX=1000/800=1.25, scaleY=800/600=1.333...
    // fitScale = min(1.25, 1.333) * 0.95 = 1.25 * 0.95 = 1.1875
    const { result } = renderHook(() =>
      useCameraControls({
        tacticalInfo: makeTacticalInfo({ mapWidth: 800, mapHeight: 600 }),
        containerSize: CONTAINER,
      }),
    )
    act(() => {
      result.current.handleFitToWindow()
    })
    expect(result.current.stageScale).toBeCloseTo(1.1875, 4)
  })

  it('handleFitToWindow does nothing when tacticalInfo is null', () => {
    const { result } = renderHook(() =>
      useCameraControls({ tacticalInfo: null, containerSize: CONTAINER }),
    )
    act(() => {
      result.current.handleFitToWindow()
    })
    expect(result.current.stageScale).toBe(1)
    expect(result.current.stagePos).toEqual({ x: 0, y: 0 })
  })

  // ── Scale clamping ─────────────────────────────────────────────

  it('handleZoomOut never drops below MIN_SCALE (0.1)', () => {
    const { result } = renderHook(() =>
      useCameraControls({ tacticalInfo: null, containerSize: CONTAINER }),
    )
    // Zoom out many times — each call divides by SCALE_BY^2 ≈ 1.1025
    act(() => {
      for (let i = 0; i < 60; i++) {
        result.current.handleZoomOut()
      }
    })
    expect(result.current.stageScale).toBeGreaterThanOrEqual(0.1)
  })

  it('handleZoomIn never exceeds MAX_SCALE (5)', () => {
    const { result } = renderHook(() =>
      useCameraControls({ tacticalInfo: null, containerSize: CONTAINER }),
    )
    act(() => {
      for (let i = 0; i < 60; i++) {
        result.current.handleZoomIn()
      }
    })
    expect(result.current.stageScale).toBeLessThanOrEqual(5)
  })
})
