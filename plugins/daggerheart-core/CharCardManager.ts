// plugins/daggerheart-core/CharCardManager.ts
import type { WorkflowContext } from '@myvtt/sdk'
import { DH_KEYS } from '../daggerheart/types'
import type {
  DHAttributes,
  DHHealth,
  DHStress,
  DHExtras,
  DHThresholds,
  DHExperiences,
} from '../daggerheart/types'
import { useIdentityStore } from '../../src/stores/identityStore'
import { createDefaultDHEntityData } from '../daggerheart/templates'
import { defaultPCPermissions } from '../../src/shared/permissions'

const VALID_ATTRS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const
const VALID_RES_KEYS = ['health', 'stress'] as const
const VALID_THRESHOLD_KEYS = ['evasion', 'major', 'severe'] as const

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

  updateResource(
    ctx: WorkflowContext,
    entityId: string,
    resource: string,
    field: 'current' | 'max',
    value: number,
  ): void {
    if (!VALID_RES_KEYS.includes(resource as (typeof VALID_RES_KEYS)[number])) return
    const key = DH_KEYS[resource as (typeof VALID_RES_KEYS)[number]]
    ctx.updateComponent(entityId, key, (prev: unknown) => {
      const p = (prev ?? { current: 0, max: 0 }) as DHHealth | DHStress
      return { ...p, [field]: value }
    })
  }

  updateExtras(
    ctx: WorkflowContext,
    entityId: string,
    field: string,
    value: number,
  ): void {
    ctx.updateComponent(entityId, DH_KEYS.extras, (prev: unknown) => {
      const p = (prev ?? { hope: 0, hopeMax: 6, armor: 0, armorMax: 0 }) as DHExtras
      return { ...p, [field]: value }
    })
  }

  updateThreshold(
    ctx: WorkflowContext,
    entityId: string,
    threshold: string,
    value: number,
  ): void {
    if (!VALID_THRESHOLD_KEYS.includes(threshold as (typeof VALID_THRESHOLD_KEYS)[number])) return
    ctx.updateComponent(entityId, DH_KEYS.thresholds, (prev: unknown) => {
      const p = (prev ?? { evasion: 10, major: 7, severe: 15 }) as DHThresholds
      return { ...p, [threshold]: value }
    })
  }

  updateExperience(
    ctx: WorkflowContext,
    entityId: string,
    index: number,
    field: 'name' | 'modifier',
    value: string | number,
  ): void {
    ctx.updateComponent(entityId, DH_KEYS.experiences, (prev: unknown) => {
      const p = (prev ?? { items: [] }) as DHExperiences
      const items = [...p.items]
      if (index < 0 || index >= items.length) return p
      const current = items[index]
      if (!current) return p
      items[index] = {
        name: field === 'name' ? (value as string) : current.name,
        modifier: field === 'modifier' ? (value as number) : current.modifier,
      }
      return { ...p, items }
    })
  }

  addExperience(ctx: WorkflowContext, entityId: string, name: string, modifier: number): void {
    ctx.updateComponent(entityId, DH_KEYS.experiences, (prev: unknown) => {
      const p = (prev ?? { items: [] }) as DHExperiences
      return { ...p, items: [...p.items, { name, modifier }] }
    })
  }

  removeExperience(ctx: WorkflowContext, entityId: string, index: number): void {
    ctx.updateComponent(entityId, DH_KEYS.experiences, (prev: unknown) => {
      const p = (prev ?? { items: [] }) as DHExperiences
      const items = p.items.filter((_, i) => i !== index)
      return { ...p, items }
    })
  }
}
