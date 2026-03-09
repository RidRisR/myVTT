import { snapToGrid, screenToMap, canDragToken } from '../combatUtils'
import { makeEntity } from '../../__test-utils__/fixtures'

// ── snapToGrid ──────────────────────────────────────────────────

describe('snapToGrid', () => {
  it('snaps to nearest grid cell center', () => {
    // gridSize=50, offset=0 → (73, 28) snaps to col=1,row=1 → (50, 50)... wait
    // Actually: col=round(73/50)=round(1.46)=1, row=round(28/50)=round(0.56)=1
    // x=1*50=50, y=1*50=50
    expect(snapToGrid(73, 28, 50, 0, 0)).toEqual({ x: 50, y: 50 })
  })

  it('snaps exactly on grid boundary', () => {
    expect(snapToGrid(100, 200, 50, 0, 0)).toEqual({ x: 100, y: 200 })
  })

  it('accounts for grid offset', () => {
    // gridSize=50, offsetX=10, offsetY=10
    // col=round((55-10)/50)=round(0.9)=1, x=1*50+10=60
    // row=round((35-10)/50)=round(0.5)=1 (banker's or standard), y=1*50+10=60
    expect(snapToGrid(55, 35, 50, 10, 10)).toEqual({ x: 60, y: 60 })
  })

  it('handles negative coordinates', () => {
    // col=round(-80/50)=round(-1.6)=-2, x=-100
    // row=round(-130/50)=round(-2.6)=-3, y=-150
    expect(snapToGrid(-80, -130, 50, 0, 0)).toEqual({ x: -100, y: -150 })
  })
})

// ── screenToMap ─────────────────────────────────────────────────

describe('screenToMap', () => {
  const rect = { left: 100, top: 50 } as DOMRect

  it('converts screen to map coordinates at scale=1', () => {
    expect(screenToMap(300, 250, rect, 1, 0, 0)).toEqual({ mapX: 200, mapY: 200 })
  })

  it('divides by scale', () => {
    // relX=300-100=200, mapX=(200-0)/2=100
    expect(screenToMap(300, 250, rect, 2, 0, 0)).toEqual({ mapX: 100, mapY: 100 })
  })

  it('subtracts positionX/Y before dividing', () => {
    // relX=300-100=200, mapX=(200-50)/1=150
    expect(screenToMap(300, 250, rect, 1, 50, 50)).toEqual({ mapX: 150, mapY: 150 })
  })

  it('handles negative position offsets', () => {
    // relX=200, mapX=(200-(-100))/1=300
    expect(screenToMap(300, 250, rect, 1, -100, -100)).toEqual({ mapX: 300, mapY: 300 })
  })
})

// ── canDragToken ────────────────────────────────────────────────

describe('canDragToken', () => {
  it('GM can always drag', () => {
    expect(canDragToken('GM', null, 'seat-1')).toBe(true)
  })

  it('PL with null entity cannot drag', () => {
    expect(canDragToken('PL', null, 'seat-1')).toBe(false)
  })

  it('PL with owner permission can drag', () => {
    const entity = makeEntity({
      permissions: { default: 'none', seats: { 'seat-1': 'owner' } },
    })
    expect(canDragToken('PL', entity, 'seat-1')).toBe(true)
  })

  it('PL with observer permission cannot drag', () => {
    const entity = makeEntity({
      permissions: { default: 'observer', seats: {} },
    })
    expect(canDragToken('PL', entity, 'seat-1')).toBe(false)
  })
})
