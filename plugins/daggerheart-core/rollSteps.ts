// plugins/daggerheart-core/rollSteps.ts
import type { IPluginSDK } from '@myvtt/sdk'
import { dhEvaluateRoll } from '../daggerheart/diceSystem'

export function registerDHCoreSteps(sdk: IPluginSDK): void {
  // After generate: evaluate Hope/Fear judgment
  sdk.addStep('roll', {
    id: 'dh:judge',
    after: 'generate',
    run: (ctx) => {
      const rolls = ctx.data.rolls as number[][] | undefined
      const total = ctx.data.total as number | undefined
      if (!rolls || total == null) return
      const judgment = dhEvaluateRoll(rolls, total)
      if (judgment) {
        ctx.data.judgment = judgment
      }
    },
  })

  // Before display: resolve Hope/Fear effects
  sdk.addStep('roll', {
    id: 'dh:resolve',
    before: 'display',
    run: (ctx) => {
      const judgment = ctx.data.judgment as { type: string; outcome: string } | undefined
      if (!judgment || judgment.type !== 'daggerheart') return
      const outcome = judgment.outcome
      if (outcome === 'success_fear' || outcome === 'failure_fear') {
        ctx.updateTeamTracker('Fear', { current: 1 })
      }
    },
  })
}
