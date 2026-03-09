// src/shared/entityTypes.ts

export type PermissionLevel = 'none' | 'observer' | 'owner'

export interface EntityPermissions {
  default: PermissionLevel
  seats: Record<string, PermissionLevel>
}

export interface Entity {
  id: string
  name: string
  imageUrl: string
  color: string
  size: number
  blueprintId?: string
  notes: string
  ruleData: unknown
  permissions: EntityPermissions
}

export interface MapToken {
  id: string
  entityId?: string
  x: number
  y: number
  size: number
  gmOnly: boolean
  label?: string
  imageUrl?: string
  color?: string
}

export interface Blueprint {
  id: string
  name: string
  imageUrl: string
  defaultSize: number
  defaultColor: string
  defaultRuleData?: unknown
}
