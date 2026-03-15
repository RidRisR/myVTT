import type { DHRuleData } from './types'

export function createDefaultDHEntityData(): DHRuleData {
  return {
    agility: 0,
    strength: 0,
    finesse: 0,
    instinct: 0,
    presence: 0,
    knowledge: 0,
    tier: 1,
    proficiency: 1,
    className: '',
    ancestry: '',
    hp: { current: 0, max: 0 },
    stress: { current: 0, max: 0 },
    hope: 0,
    armor: 0,
  }
}
