import type { WorkflowContext } from '@myvtt/sdk'

const FEAR_ENTITY_ID = 'daggerheart-core:fear'
const FEAR_COMPONENT_KEY = 'daggerheart-core:fear-tracker'

export class FearManager {
  readonly entityId = FEAR_ENTITY_ID

  async ensureEntity(ctx: WorkflowContext): Promise<void> {
    const existing = ctx.read.entity(FEAR_ENTITY_ID)
    if (existing) return

    await ctx.createEntity({
      id: FEAR_ENTITY_ID,
      components: { [FEAR_COMPONENT_KEY]: { current: 0, max: 10 } },
      lifecycle: 'persistent',
    })
  }

  addFear(ctx: WorkflowContext): void {
    ctx.updateComponent(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY, (prev: unknown) => {
      const p = (prev ?? { current: 0, max: 10 }) as { current: number; max: number }
      return { ...p, current: p.current + 1 }
    })
  }
}
