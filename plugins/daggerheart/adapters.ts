import type { Entity, ResourceView, StatusView } from '@myvtt/sdk'
import type { DHRuleData } from './types'

function getDH(entity: Entity): DHRuleData | null {
  return entity.ruleData ? (entity.ruleData as DHRuleData) : null
}

export function dhGetMainResource(entity: Entity): ResourceView | null {
  const d = getDH(entity)
  if (!d?.hp) return null
  return { label: 'HP', current: d.hp.current, max: d.hp.max, color: '#ef4444' }
}

export function dhGetPortraitResources(entity: Entity): ResourceView[] {
  const d = getDH(entity)
  if (!d?.hp) return []
  const resources: ResourceView[] = [
    { label: 'HP', current: d.hp.current, max: d.hp.max, color: '#ef4444' },
  ]
  if (d.stress) {
    resources.push({
      label: 'Stress',
      current: d.stress.current,
      max: d.stress.max,
      color: '#f97316',
    })
  }
  return resources
}

export function dhGetStatuses(_entity: Entity): StatusView[] {
  return []
}

export function dhGetFormulaTokens(entity: Entity): Record<string, number> {
  const d = getDH(entity)
  if (!d) return {}
  return {
    agility: d.agility,
    strength: d.strength,
    finesse: d.finesse,
    instinct: d.instinct,
    presence: d.presence,
    knowledge: d.knowledge,
    proficiency: d.proficiency,
  }
}
