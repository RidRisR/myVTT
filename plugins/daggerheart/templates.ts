import type {
  DHHealth,
  DHStress,
  DHAttributes,
  DHMeta,
  DHExtras,
  DHThresholds,
  DHExperiences,
  DHRollTemplates,
} from './types'
import { DH_KEYS } from './types'

export function createDefaultDHEntityData(): Record<string, unknown> {
  return {
    [DH_KEYS.health]: { current: 0, max: 0 } satisfies DHHealth,
    [DH_KEYS.stress]: { current: 0, max: 0 } satisfies DHStress,
    [DH_KEYS.attributes]: {
      agility: 0,
      strength: 0,
      finesse: 0,
      instinct: 0,
      presence: 0,
      knowledge: 0,
    } satisfies DHAttributes,
    [DH_KEYS.meta]: {
      tier: 1,
      proficiency: 1,
      className: '',
      ancestry: '',
    } satisfies DHMeta,
    [DH_KEYS.extras]: { hope: 0, hopeMax: 6, armor: 0, armorMax: 0 } satisfies DHExtras,
    [DH_KEYS.thresholds]: { evasion: 10, major: 7, severe: 15 } satisfies DHThresholds,
    [DH_KEYS.experiences]: { items: [] } satisfies DHExperiences,
    [DH_KEYS.rollTemplates]: { items: [] } satisfies DHRollTemplates,
  }
}
