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
  persistent: boolean
}

export interface MapToken {
  id: string
  entityId?: string
  x: number
  y: number
  size: number
  permissions: EntityPermissions
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

// --- New types for data layer refactor (SceneV2 replaces Scene in Task 8) ---

export interface Atmosphere {
  imageUrl: string
  width: number
  height: number
  particlePreset: 'none' | 'embers' | 'snow' | 'dust' | 'rain' | 'fireflies'
  ambientPreset: string
  ambientAudioUrl: string
  ambientAudioVolume: number
}

export interface EncounterData {
  name: string
  mapUrl: string
  mapWidth: number
  mapHeight: number
  grid: {
    size: number
    snap: boolean
    visible: boolean
    color: string
    offsetX: number
    offsetY: number
  }
  tokens: Record<
    string,
    {
      name: string
      imageUrl: string
      color: string
      size: number
      x: number
      y: number
      entityId?: string
      ruleData?: unknown
      blueprintId?: string
    }
  >
}

export interface SceneV2 {
  id: string
  name: string
  sortOrder: number
  atmosphere: Atmosphere
  entityIds: string[]
  encounters: Record<string, EncounterData>
}

export interface CombatState {
  mapUrl: string
  mapWidth: number
  mapHeight: number
  grid: {
    size: number
    snap: boolean
    visible: boolean
    color: string
    offsetX: number
    offsetY: number
  }
  tokens: MapToken[]
  initiativeOrder: string[]
  initiativeIndex: number
}
