// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import type React from 'react'
import { useEntityDrop } from '../hooks/useEntityDrop'
import { snapToGrid } from '../combatUtils'
import type { TacticalInfo } from '../../stores/worldStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTacticalInfo(overrides?: Partial<TacticalInfo>): TacticalInfo {
  return {
    sceneId: 'scene-1',
    mapUrl: null,
    mapWidth: 800,
    mapHeight: 600,
    grid: {
      size: 50,
      snap: false,
      visible: true,
      color: 'rgba(255,255,255,0.15)',
      offsetX: 0,
      offsetY: 0,
    },
    tokens: [],
    roundNumber: 0,
    currentTurnTokenId: null,
    ...overrides,
  }
}

function makeContainerRef(rect = { left: 100, top: 200 }) {
  return {
    current: {
      getBoundingClientRect: () => ({
        left: rect.left,
        top: rect.top,
        right: rect.left + 800,
        bottom: rect.top + 600,
        width: 800,
        height: 600,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
      }),
    },
  } as React.RefObject<HTMLDivElement>
}

function makeDragOverEvent(types: string[]) {
  return {
    dataTransfer: { types, dropEffect: '' },
    preventDefault: vi.fn(),
  } as unknown as React.DragEvent<HTMLDivElement>
}

function makeDropEvent(entityId: string, clientX: number, clientY: number) {
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      types: ['application/x-entity-id'],
      getData: (type: string) => (type === 'application/x-entity-id' ? entityId : ''),
    },
    clientX,
    clientY,
  } as unknown as React.DragEvent<HTMLDivElement>
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useEntityDrop', () => {
  // ── handleDragOver ──────────────────────────────────────────────────────────

  it('calls preventDefault and sets dropEffect to copy when types include the entity MIME type', () => {
    const onDropEntityOnMap = vi.fn()
    const containerRef = makeContainerRef()
    const { result } = renderHook(() =>
      useEntityDrop({
        containerRef,
        stagePos: { x: 0, y: 0 },
        stageScale: 1,
        tacticalInfo: null,
        onDropEntityOnMap,
      }),
    )

    const event = makeDragOverEvent(['application/x-entity-id', 'text/plain'])

    act(() => {
      result.current.handleDragOver(event)
    })

    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.dataTransfer.dropEffect).toBe('copy')
  })

  it('does NOT call preventDefault when types do not include the entity MIME type', () => {
    const containerRef = makeContainerRef()
    const { result } = renderHook(() =>
      useEntityDrop({
        containerRef,
        stagePos: { x: 0, y: 0 },
        stageScale: 1,
        tacticalInfo: null,
        onDropEntityOnMap: vi.fn(),
      }),
    )

    const event = makeDragOverEvent(['text/plain', 'Files'])

    act(() => {
      result.current.handleDragOver(event)
    })

    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  // ── handleDrop — coordinate conversion ─────────────────────────────────────

  it('calls onDropEntityOnMap with correct map coordinates', () => {
    // Container rect: left=100, top=200
    // clientX=310, clientY=420 → screenX=210, screenY=220
    // stagePos={x:10, y:20}, stageScale=2
    // mapX = (210 - 10) / 2 = 100
    // mapY = (220 - 20) / 2 = 100
    const onDropEntityOnMap = vi.fn()
    const containerRef = makeContainerRef({ left: 100, top: 200 })

    const { result } = renderHook(() =>
      useEntityDrop({
        containerRef,
        stagePos: { x: 10, y: 20 },
        stageScale: 2,
        tacticalInfo: makeTacticalInfo({
          grid: { size: 50, snap: false, visible: true, color: '', offsetX: 0, offsetY: 0 },
        }),
        onDropEntityOnMap,
      }),
    )

    const event = makeDropEvent('entity-123', 310, 420)

    act(() => {
      result.current.handleDrop(event)
    })

    expect(onDropEntityOnMap).toHaveBeenCalledWith('entity-123', 100, 100)
  })

  // ── handleDrop — grid snap ──────────────────────────────────────────────────

  it('snaps coordinates to the nearest grid cell when grid.snap is true', () => {
    // Container rect: left=0, top=0
    // clientX=163, clientY=278 → screenX=163, screenY=278
    // stagePos={x:0, y:0}, stageScale=1
    // raw mapX=163, mapY=278
    // grid: size=50, offsetX=0, offsetY=0 → snap to nearest 50
    // col = round(163/50) = round(3.26) = 3 → x = 3*50 = 150
    // row = round(278/50) = round(5.56) = 6 → y = 6*50 = 300
    const onDropEntityOnMap = vi.fn()
    const containerRef = makeContainerRef({ left: 0, top: 0 })

    const gridConfig = { size: 50, snap: true, visible: true, color: '', offsetX: 0, offsetY: 0 }
    const { result } = renderHook(() =>
      useEntityDrop({
        containerRef,
        stagePos: { x: 0, y: 0 },
        stageScale: 1,
        tacticalInfo: makeTacticalInfo({ grid: gridConfig }),
        onDropEntityOnMap,
      }),
    )

    const event = makeDropEvent('entity-abc', 163, 278)

    act(() => {
      result.current.handleDrop(event)
    })

    const expected = snapToGrid(163, 278, 50, 0, 0)
    expect(onDropEntityOnMap).toHaveBeenCalledWith('entity-abc', expected.x, expected.y)
  })

  // ── handleDrop — no entityId ────────────────────────────────────────────────

  it('does NOT call onDropEntityOnMap when getData returns an empty string', () => {
    const onDropEntityOnMap = vi.fn()
    const containerRef = makeContainerRef()

    const { result } = renderHook(() =>
      useEntityDrop({
        containerRef,
        stagePos: { x: 0, y: 0 },
        stageScale: 1,
        tacticalInfo: null,
        onDropEntityOnMap,
      }),
    )

    const event = makeDropEvent('', 200, 300)

    act(() => {
      result.current.handleDrop(event)
    })

    expect(onDropEntityOnMap).not.toHaveBeenCalled()
  })

  // ── handleDrop — no onDropEntityOnMap callback ──────────────────────────────

  it('does not crash when onDropEntityOnMap is undefined', () => {
    const containerRef = makeContainerRef()

    const { result } = renderHook(() =>
      useEntityDrop({
        containerRef,
        stagePos: { x: 0, y: 0 },
        stageScale: 1,
        tacticalInfo: null,
        onDropEntityOnMap: undefined,
      }),
    )

    const event = makeDropEvent('entity-xyz', 200, 300)

    expect(() => {
      act(() => {
        result.current.handleDrop(event)
      })
    }).not.toThrow()
  })
})
