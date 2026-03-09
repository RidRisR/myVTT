import type { Entity } from '../shared/entityTypes'
import { canEdit } from '../shared/permissions'

export function snapToGrid(
  mapX: number,
  mapY: number,
  gridSize: number,
  gridOffsetX: number,
  gridOffsetY: number,
): { x: number; y: number } {
  const col = Math.round((mapX - gridOffsetX) / gridSize)
  const row = Math.round((mapY - gridOffsetY) / gridSize)
  return {
    x: col * gridSize + gridOffsetX,
    y: row * gridSize + gridOffsetY,
  }
}

export function screenToMap(
  screenX: number,
  screenY: number,
  wrapperRect: DOMRect,
  scale: number,
  positionX: number,
  positionY: number,
): { mapX: number; mapY: number } {
  const relX = screenX - wrapperRect.left
  const relY = screenY - wrapperRect.top
  return {
    mapX: (relX - positionX) / scale,
    mapY: (relY - positionY) / scale,
  }
}

export function canDragToken(role: 'GM' | 'PL', entity: Entity | null, mySeatId: string): boolean {
  if (role === 'GM') return true
  if (!entity) return false
  return canEdit(entity, mySeatId, role)
}
