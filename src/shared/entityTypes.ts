// src/shared/entityTypes.ts

export type PermissionLevel = 'none' | 'observer' | 'owner'

export type EntityLifecycle = 'persistent' | 'tactical' | 'scene'

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
  blueprintId?: string
  permissions: EntityPermissions
  lifecycle: EntityLifecycle
  tags: string[]
  components: Record<string, unknown>
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
  tags: string[]
  defaults: {
    components: Record<string, unknown>
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
