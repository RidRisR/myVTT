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
  return canEdit(entity.permissions, mySeatId, role)
}

export interface TokenLike {
  id: string
  entityId: string | null
}

/**
 * Resolve a token ID to its associated entity.
 * Returns [token, entity] or [null, null] if not found.
 */
export function resolveTokenEntity<T extends TokenLike>(
  tokens: T[],
  tokenId: string | undefined | null,
  getEntity: (id: string) => Entity | null | undefined,
): [T | null, Entity | null] {
  if (!tokenId) return [null, null]
  const token = tokens.find((t) => t.id === tokenId) ?? null
  const entity = token?.entityId ? (getEntity(token.entityId) ?? null) : null
  return [token, entity]
}
