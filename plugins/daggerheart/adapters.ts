import type { Entity, ResourceView, StatusView } from '@myvtt/sdk'
import type { DHHealth, DHStress, DHAttributes } from './types'
import { DH_KEYS } from './types'

export function dhGetMainResource(entity: Entity): ResourceView | null {
  const hp = entity.components[DH_KEYS.health] as DHHealth | undefined
  if (!hp) return null
  return { label: 'HP', current: hp.current, max: hp.max, color: '#ef4444' }
}

export function dhGetPortraitResources(entity: Entity): ResourceView[] {
  const hp = entity.components[DH_KEYS.health] as DHHealth | undefined
  if (!hp) return []
  const resources: ResourceView[] = [
    { label: 'HP', current: hp.current, max: hp.max, color: '#ef4444' },
  ]
  const stress = entity.components[DH_KEYS.stress] as DHStress | undefined
  if (stress) {
    resources.push({
      label: 'Stress',
      current: stress.current,
      max: stress.max,
      color: '#f97316',
    })
  }
  return resources
}

export function dhGetStatuses(_entity: Entity): StatusView[] {
  return []
}

export function dhGetFormulaTokens(entity: Entity): Record<string, number> {
  const attrs = entity.components[DH_KEYS.attributes] as DHAttributes | undefined
  if (!attrs) return {}
  return {
    agility: attrs.agility,
    strength: attrs.strength,
    finesse: attrs.finesse,
    instinct: attrs.instinct,
    presence: attrs.presence,
    knowledge: attrs.knowledge,
    proficiency:
      (entity.components[DH_KEYS.meta] as { proficiency?: number } | undefined)?.proficiency ?? 0,
  }
}
