// plugins/daggerheart-core/CharCardManager.ts
import type { WorkflowContext } from '@myvtt/sdk'
import { DH_KEYS } from '../daggerheart/types'
import type { DHAttributes } from '../daggerheart/types'

const VALID_ATTRS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const

export class CharCardManager {
  updateAttribute(ctx: WorkflowContext, entityId: string, attribute: string, value: number): void {
    if (!VALID_ATTRS.includes(attribute as (typeof VALID_ATTRS)[number])) return
    ctx.updateComponent(entityId, DH_KEYS.attributes, (prev: unknown) => {
      const p = (prev ?? {
        agility: 0,
        strength: 0,
        finesse: 0,
        instinct: 0,
        presence: 0,
        knowledge: 0,
      }) as DHAttributes
      return { ...p, [attribute]: value }
    })
  }
}
