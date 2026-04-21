// plugins/daggerheart-core/FearManager.ts
import type { WorkflowContext } from '@myvtt/sdk'

const FEAR_ENTITY_ID = 'daggerheart-core:fear'
const FEAR_COMPONENT_KEY = 'daggerheart-core:fear-tracker'
const FEAR_MAX = 12

export { FEAR_ENTITY_ID, FEAR_COMPONENT_KEY, FEAR_MAX }

export class FearManager {
  readonly entityId = FEAR_ENTITY_ID

  async ensureEntity(ctx: WorkflowContext): Promise<void> {
    const existing = ctx.read.entity(FEAR_ENTITY_ID)
    if (existing) return

    await ctx.createEntity({
      id: FEAR_ENTITY_ID,
      components: { [FEAR_COMPONENT_KEY]: { current: 0, max: FEAR_MAX } },
      lifecycle: 'persistent',
    })
  }

  /** Set fear to an absolute value, clamped to [0, max]. */
  setFear(ctx: WorkflowContext, value: number): void {
    ctx.updateComponent(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY, (prev: unknown) => {
      const p = (prev ?? { current: 0, max: FEAR_MAX }) as { current: number; max: number }
      const clamped = Math.max(0, Math.min(p.max, value))
      return { ...p, current: clamped }
    })
  }

  /** Increment fear by 1. Used by action-check resolve step. */
  addFear(ctx: WorkflowContext): void {
    ctx.updateComponent(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY, (prev: unknown) => {
      const p = (prev ?? { current: 0, max: FEAR_MAX }) as { current: number; max: number }
      return { ...p, current: Math.min(p.max, p.current + 1) }
    })
  }
}
