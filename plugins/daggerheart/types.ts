// plugins/daggerheart/types.ts
// Component types for Daggerheart plugin — each maps to an entity component key

export interface DHHealth {
  current: number
  max: number
}
export interface DHStress {
  current: number
  max: number
}
export interface DHAttributes {
  agility: number
  strength: number
  finesse: number
  instinct: number
  presence: number
  knowledge: number
}
export interface DHMeta {
  tier: 1 | 2 | 3 | 4
  proficiency: number
  className: string
  ancestry: string
}
export interface DHExtras {
  hope: number
  armor: number
}

// Component keys for Daggerheart plugin
export const DH_KEYS = {
  health: 'daggerheart:health',
  stress: 'daggerheart:stress',
  attributes: 'daggerheart:attributes',
  meta: 'daggerheart:meta',
  extras: 'daggerheart:extras',
} as const

// Module augmentation — extends core ComponentTypeMap with Daggerheart keys
declare module '../../src/shared/componentTypes' {
  interface ComponentTypeMap {
    'daggerheart:health': DHHealth
    'daggerheart:stress': DHStress
    'daggerheart:attributes': DHAttributes
    'daggerheart:meta': DHMeta
    'daggerheart:extras': DHExtras
  }
}

// Module augmentation — extends core LogPayloadMap with Daggerheart log entries
declare module '../../src/shared/logTypes' {
  interface LogPayloadMap {
    'dh:judgment': {
      formula: string
      rolls: number[][]
      total: number
      judgment: { type: string; outcome: string }
    }
  }
}
