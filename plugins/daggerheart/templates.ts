import type { DHHealth, DHStress, DHAttributes, DHMeta, DHExtras } from './types'
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
    [DH_KEYS.extras]: { hope: 0, armor: 0 } satisfies DHExtras,
  }
}
