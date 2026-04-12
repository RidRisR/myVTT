import { uuidv7 } from '../../src/shared/uuidv7'
import {
  DH_ATTRIBUTE_LABELS,
  type DHAttributeKey,
  type DHAttributes,
  type DHExperience,
  type DHExperiences,
  type DHRollTemplateConfig,
  type DHRollTemplateModifierRef,
} from '../daggerheart/types'
import type { ModifierSource, RollConfig } from './rollTypes'

const ATTRIBUTE_SOURCE_PREFIX = 'attribute:'
const EXPERIENCE_SOURCE_PREFIX = 'experience:'

function cloneTemplateModifierRef(
  modifier: DHRollTemplateModifierRef,
): DHRollTemplateModifierRef {
  return { ...modifier }
}

export function cloneTemplateConfig(config: DHRollTemplateConfig): DHRollTemplateConfig {
  return {
    dualityDice: config.dualityDice ? { ...config.dualityDice } : null,
    diceGroups: config.diceGroups.map((group) => ({
      ...group,
      keep: group.keep ? { ...group.keep } : undefined,
    })),
    modifiers: config.modifiers.map(cloneTemplateModifierRef),
    constantModifier: config.constantModifier,
    sideEffects: config.sideEffects.map((effect) => ({ ...effect })),
    dc: config.dc,
  }
}

export function createDefaultRollTemplateConfig(): DHRollTemplateConfig {
  return {
    dualityDice: { hopeFace: 12, fearFace: 12 },
    diceGroups: [],
    modifiers: [],
    constantModifier: 0,
    sideEffects: [],
  }
}

function cloneRollModifier(modifier: ModifierSource): ModifierSource {
  return { ...modifier }
}

export function extractTemplateConfigFromRollConfig(config: RollConfig): DHRollTemplateConfig {
  return {
    dualityDice: config.dualityDice ? { ...config.dualityDice } : null,
    diceGroups: config.diceGroups.map((group) => ({
      ...group,
      keep: group.keep ? { ...group.keep } : undefined,
    })),
    modifiers: config.modifiers.map((modifier) => {
      if (modifier.source.startsWith(ATTRIBUTE_SOURCE_PREFIX)) {
        const attributeKey = modifier.source.slice(ATTRIBUTE_SOURCE_PREFIX.length) as DHAttributeKey
        return {
          type: 'attribute',
          attributeKey,
          labelSnapshot: modifier.label,
        }
      }

      if (modifier.source.startsWith(EXPERIENCE_SOURCE_PREFIX)) {
        return {
          type: 'experience',
          experienceKey: modifier.source.slice(EXPERIENCE_SOURCE_PREFIX.length),
          labelSnapshot: modifier.label,
          modifierSnapshot: modifier.value,
        }
      }

      return {
        type: 'static',
        source: modifier.source,
        label: modifier.label,
        value: modifier.value,
      }
    }),
    constantModifier: config.constantModifier,
    sideEffects: config.sideEffects.map((effect) => ({ ...effect })),
    dc: config.dc,
  }
}

function resolveModifierRef(
  modifier: DHRollTemplateModifierRef,
  attributes: DHAttributes,
  experiences: DHExperiences,
): ModifierSource | null {
  if (modifier.type === 'attribute') {
    return {
      source: `${ATTRIBUTE_SOURCE_PREFIX}${modifier.attributeKey}`,
      label: DH_ATTRIBUTE_LABELS[modifier.attributeKey] ?? modifier.labelSnapshot ?? modifier.attributeKey,
      value: attributes[modifier.attributeKey] ?? 0,
    }
  }

  if (modifier.type === 'experience') {
    const experience = experiences.items.find((item) => item.key === modifier.experienceKey)
    if (!experience) return null
    return {
      source: `${EXPERIENCE_SOURCE_PREFIX}${experience.key}`,
      label: experience.name || modifier.labelSnapshot || experience.key,
      value: experience.modifier,
    }
  }

  return {
    source: modifier.source,
    label: modifier.label,
    value: modifier.value,
  }
}

export function materializeRollConfigFromTemplate(
  config: DHRollTemplateConfig,
  attributes: DHAttributes,
  experiences: DHExperiences,
): RollConfig {
  return {
    dualityDice: config.dualityDice ? { ...config.dualityDice } : null,
    diceGroups: config.diceGroups.map((group) => ({
      ...group,
      keep: group.keep ? { ...group.keep } : undefined,
    })),
    modifiers: config.modifiers
      .map((modifier) => resolveModifierRef(modifier, attributes, experiences))
      .filter((modifier): modifier is ModifierSource => modifier !== null)
      .map(cloneRollModifier),
    constantModifier: config.constantModifier,
    sideEffects: config.sideEffects.map((effect) => ({ ...effect })),
    dc: config.dc,
  }
}

export function mergeTemplateConfigAfterEditorRoundTrip(
  originalConfig: DHRollTemplateConfig,
  editedRollConfig: RollConfig,
  experiences: DHExperiences,
): DHRollTemplateConfig {
  const nextConfig = extractTemplateConfigFromRollConfig(editedRollConfig)
  const missingExperienceRefs = originalConfig.modifiers.filter(
    (modifier) =>
      modifier.type === 'experience' &&
      !experiences.items.some((experience) => experience.key === modifier.experienceKey) &&
      !nextConfig.modifiers.some(
        (nextModifier) =>
          nextModifier.type === 'experience' &&
          nextModifier.experienceKey === modifier.experienceKey,
      ),
  )

  return {
    ...nextConfig,
    modifiers: [
      ...nextConfig.modifiers.map(cloneTemplateModifierRef),
      ...missingExperienceRefs.map(cloneTemplateModifierRef),
    ],
  }
}

function slugifyExperienceName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function createExperienceKey(name: string, existingKeys: Iterable<string>): string {
  const taken = new Set(existingKeys)
  const base = slugifyExperienceName(name) || `exp-${uuidv7().slice(-8)}`
  let candidate = base
  let i = 2
  while (taken.has(candidate)) {
    candidate = `${base}-${i}`
    i += 1
  }
  return candidate
}

export function ensureExperienceKeys(experiences: DHExperience[]): DHExperience[] {
  const next: DHExperience[] = []
  const taken = new Set<string>()

  for (const experience of experiences) {
    const trimmed = experience.key?.trim() ?? ''
    const key = trimmed && !taken.has(trimmed)
      ? trimmed
      : createExperienceKey(experience.name, taken)
    taken.add(key)
    next.push({
      ...experience,
      key,
    })
  }

  return next
}

export function createRollTemplateId(): string {
  return `tmpl_${uuidv7()}`
}
