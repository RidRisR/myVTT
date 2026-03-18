// src/shared/entityTypes.ts

export type PermissionLevel = 'none' | 'observer' | 'owner'

export type EntityLifecycle = 'ephemeral' | 'reusable' | 'persistent'

export interface SceneEntityEntry {
  entityId: string
  visible: boolean
}

export interface EntityPermissions {
  default: PermissionLevel
  seats: Record<string, PermissionLevel>
}

export interface Entity {
  id: string
  name: string
  imageUrl: string
  color: string
  width: number
  height: number
  blueprintId?: string
  notes: string
  ruleData: unknown
  permissions: EntityPermissions
  lifecycle: EntityLifecycle
}

export interface MapToken {
  id: string
  entityId: string
  x: number
  y: number
  width: number
  height: number
  imageScaleX: number
  imageScaleY: number
}

export interface Blueprint {
  id: string
  name: string
  imageUrl: string
  tags: string[]
  defaults: {
    color: string
    width: number
    height: number
    ruleData?: unknown
  }
  createdAt: number
}

export interface Atmosphere {
  imageUrl: string
  width: number
  height: number
  particlePreset: 'none' | 'embers' | 'snow' | 'dust' | 'rain' | 'fireflies'
  ambientPreset: string
  ambientAudioUrl: string
  ambientAudioVolume: number
}
