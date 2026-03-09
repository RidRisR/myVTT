// src/shared/permissions.ts
import type { Entity, PermissionLevel } from './entityTypes'

export function getPermission(entity: Entity, seatId: string): PermissionLevel {
  return entity.permissions.seats[seatId] ?? entity.permissions.default
}

export function canSee(entity: Entity, seatId: string, role: 'GM' | 'PL'): boolean {
  if (role === 'GM') return true
  return getPermission(entity, seatId) !== 'none'
}

export function canEdit(entity: Entity, seatId: string, role: 'GM' | 'PL'): boolean {
  if (role === 'GM') return true
  return getPermission(entity, seatId) === 'owner'
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
