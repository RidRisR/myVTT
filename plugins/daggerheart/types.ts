// plugins/daggerheart/types.ts
// Component types for Daggerheart plugin — each maps to an entity component key
import type {
  DiceGroup,
  DualityDiceConfig,
  SideEffectEntry,
} from '../daggerheart-core/rollTypes'

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

export type DHAttributeKey = keyof DHAttributes

export const DH_ATTRIBUTE_LABELS: Record<DHAttributeKey, string> = {
  agility: '敏捷',
  strength: '力量',
  finesse: '灵巧',
  instinct: '直觉',
  presence: '风度',
  knowledge: '学识',
}
export interface DHMeta {
  tier: 1 | 2 | 3 | 4
  proficiency: number
  className: string
  ancestry: string
}
export interface DHExtras {
  hope: number
  hopeMax: number
  armor: number
  armorMax: number
}
export interface DHThresholds {
  evasion: number
  major: number
  severe: number
}

export interface DHExperience {
  key: string
  name: string
  modifier: number
}

export interface DHExperiences {
  items: DHExperience[]
}

export type DHRollTemplateModifierRef =
  | {
      type: 'attribute'
      attributeKey: DHAttributeKey
      labelSnapshot?: string
    }
  | {
      type: 'experience'
      experienceKey: string
      labelSnapshot?: string
      modifierSnapshot?: number
    }
  | {
      type: 'static'
      source: string
      label: string
      value: number
    }

export interface DHRollTemplateConfig {
  dualityDice: DualityDiceConfig | null
  diceGroups: DiceGroup[]
  modifiers: DHRollTemplateModifierRef[]
  constantModifier: number
  sideEffects: SideEffectEntry[]
  dc?: number
}

export interface DHRollTemplate {
  id: string
  name: string
  icon?: string
  config: DHRollTemplateConfig
  createdAt: number
  updatedAt: number
}

export interface DHRollTemplates {
  items: DHRollTemplate[]
}

// Component keys for Daggerheart plugin
export const DH_KEYS = {
  health: 'daggerheart:health',
  stress: 'daggerheart:stress',
  attributes: 'daggerheart:attributes',
  meta: 'daggerheart:meta',
  extras: 'daggerheart:extras',
  thresholds: 'daggerheart:thresholds',
  experiences: 'daggerheart:experiences',
  rollTemplates: 'daggerheart:roll-templates',
} as const

// Module augmentation — extends core ComponentTypeMap with Daggerheart keys
declare module '../../src/shared/componentTypes' {
  interface ComponentTypeMap {
    'daggerheart:health': DHHealth
    'daggerheart:stress': DHStress
    'daggerheart:attributes': DHAttributes
    'daggerheart:meta': DHMeta
    'daggerheart:extras': DHExtras
    'daggerheart:thresholds': DHThresholds
    'daggerheart:experiences': DHExperiences
    'daggerheart:roll-templates': DHRollTemplates
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
