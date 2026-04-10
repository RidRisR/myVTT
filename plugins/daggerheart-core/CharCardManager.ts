// plugins/daggerheart-core/CharCardManager.ts
import type { WorkflowContext } from '@myvtt/sdk'
import { DH_KEYS } from '../daggerheart/types'
import type { DHAttributes } from '../daggerheart/types'
import { useIdentityStore } from '../../src/stores/identityStore'
import { createDefaultDHEntityData } from '../daggerheart/templates'
import { defaultPCPermissions } from '../../src/shared/permissions'

const VALID_ATTRS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const

export class CharCardManager {
  async ensureCharacter(ctx: WorkflowContext): Promise<void> {
    const { mySeatId, seats } = useIdentityStore.getState()
    if (!mySeatId) return

    const seat = seats.find((s) => s.id === mySeatId)
    if (!seat || seat.role !== 'PL') return
    if (seat.activeCharacterId) return

    // Check if seat already owns an entity
    const allEntities = ctx.read.query({ has: [] })
    const owned = allEntities.find((e) => e.permissions.seats[mySeatId] === 'owner')
    if (owned) return

    // Deterministic ID prevents duplicates across tabs
    const entityId = `dh-char-${mySeatId}`

    // Check if entity already exists (e.g. from another tab)
    if (ctx.read.entity(entityId)) return

    await ctx.createEntity({
      id: entityId,
      components: {
        'core:identity': { name: seat.name, imageUrl: '', color: seat.color },
        ...createDefaultDHEntityData(),
      },
      lifecycle: 'persistent',
      permissions: defaultPCPermissions(mySeatId),
    })
  }

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
