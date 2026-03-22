// plugins/daggerheart-core/rollSteps.ts
import type { IPluginSDK } from '@myvtt/sdk'
import { getRollWorkflow } from '@myvtt/sdk'
import { dhEvaluateRoll } from '../daggerheart/diceSystem'

export function registerDHCoreSteps(sdk: IPluginSDK): void {
  // After generate: evaluate Hope/Fear judgment
  sdk.addStep(getRollWorkflow(), {
    id: 'dh:judge',
    after: 'generate',
    run: (ctx) => {
      const rolls = ctx.data.rolls
      const total = ctx.data.total
      if (!rolls || total == null) return
      const judgment = dhEvaluateRoll(rolls, total)
      if (judgment) {
        ctx.data.judgment = judgment
      }
    },
  })

  // Before display: resolve Hope/Fear effects
  sdk.addStep(getRollWorkflow(), {
    id: 'dh:resolve',
    before: 'display',
    run: (ctx) => {
      const judgment = ctx.data.judgment as { type: string; outcome: string } | undefined
      if (!judgment || judgment.type !== 'daggerheart') return
      const outcome = judgment.outcome
      if (outcome === 'success_hope' || outcome === 'failure_hope') {
        ctx.updateTeamTracker('Hope', { current: 1 })
      } else if (outcome === 'success_fear' || outcome === 'failure_fear') {
        ctx.updateTeamTracker('Fear', { current: 1 })
      }
    },
  })
}
