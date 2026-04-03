import type { WorkflowContext } from '@myvtt/sdk'

const EXTRAS_KEY = 'daggerheart:extras'

export class HopeResolver {
  addHope(ctx: WorkflowContext, actorId: string): void {
    ctx.updateComponent(actorId, EXTRAS_KEY, (prev: unknown) => {
      const p = (prev ?? {}) as Record<string, unknown>
      return { ...p, hope: ((p.hope as number | undefined) ?? 0) + 1 }
    })
  }
}
