// src/shared/permissions.ts
import type { Entity, EntityPermissions, MapToken, PermissionLevel } from './entityTypes'

export function getPermission(permissions: EntityPermissions, seatId: string): PermissionLevel {
  return permissions.seats[seatId] ?? permissions.default
}

export function canSee(permissions: EntityPermissions, seatId: string, role: 'GM' | 'PL'): boolean {
  if (role === 'GM') return true
  return getPermission(permissions, seatId) !== 'none'
}

export function canEdit(
  permissions: EntityPermissions,
  seatId: string,
  role: 'GM' | 'PL',
): boolean {
  if (role === 'GM') return true
  return getPermission(permissions, seatId) === 'owner'
}

export function getEffectivePermissions(
  token: MapToken,
  getEntity: (id: string) => Entity | null,
): EntityPermissions {
  if (token.entityId) {
    const entity = getEntity(token.entityId)
    if (entity) return entity.permissions
  }
  return token.permissions
}

export function defaultPCPermissions(ownerSeatId: string): Entity['permissions'] {
  return { default: 'observer', seats: { [ownerSeatId]: 'owner' } }
}

export function defaultNPCPermissions(): Entity['permissions'] {
  return { default: 'observer', seats: {} }
}

export function hiddenNPCPermissions(): Entity['permissions'] {
  return { default: 'none', seats: {} }
}
