// plugins/daggerheart-core/rollSteps.ts
import type { IPluginSDK, WorkflowHandle, JudgmentResult } from '@myvtt/sdk'
import { getRollWorkflow, toastEvent, announceEvent } from '@myvtt/sdk'
import { dhEvaluateRoll } from '../daggerheart/diceSystem'

/** Data shape for the dh:action-check workflow */
export interface DHActionCheckData {
  [key: string]: unknown
  formula: string
  actorId: string
  rolls?: number[][]
  total?: number
  judgment?: JudgmentResult
}

let _actionCheckWorkflow: WorkflowHandle<DHActionCheckData> | undefined

export function getDHActionCheckWorkflow(): WorkflowHandle<DHActionCheckData> {
  if (!_actionCheckWorkflow) {
    throw new Error('dh:action-check not initialized — call registerDHCoreSteps first')
  }
  return _actionCheckWorkflow
}

export function registerDHCoreSteps(sdk: IPluginSDK): void {
  _actionCheckWorkflow = sdk.defineWorkflow<DHActionCheckData>('dh:action-check', [
    {
      id: 'roll',
      run: async (ctx) => {
        const result = await ctx.runWorkflow(getRollWorkflow(), {
          formula: ctx.vars.formula,
          actorId: ctx.vars.actorId,
        })
        if (result.status === 'aborted') {
          ctx.abort(result.reason)
          return
        }
        ctx.vars.rolls = result.output.rolls
        ctx.vars.total = result.output.total
      },
    },
    {
      id: 'dh:judge',
      run: (ctx) => {
        const rolls = ctx.vars.rolls
        const total = ctx.vars.total
        if (!rolls || total == null) return
        const judgment = dhEvaluateRoll(rolls, total)
        if (judgment) {
          ctx.vars.judgment = judgment
        }
      },
    },
    {
      id: 'dh:resolve',
      run: (ctx) => {
        const judgment = ctx.vars.judgment as { type: string; outcome: string } | undefined
        if (!judgment || judgment.type !== 'daggerheart') return
        const outcome = judgment.outcome
        if (outcome === 'success_hope' || outcome === 'failure_hope') {
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- will be removed when teamTracker is redesigned
          ctx.updateTeamTracker('Hope', { current: 1 })
        } else if (outcome === 'success_fear' || outcome === 'failure_fear') {
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- will be removed when teamTracker is redesigned
          ctx.updateTeamTracker('Fear', { current: 1 })
        }
      },
    },
    {
      id: 'display',
      run: (ctx) => {
        const { formula, total, judgment } = ctx.vars
        if (typeof total !== 'number') return
        const dh = judgment as { type: string; outcome: string } | undefined
        const judgmentStr = dh?.type === 'daggerheart' ? ` (${dh.outcome})` : ''
        ctx.events.emit(toastEvent, {
          text: `🎲 ${formula} = ${total}${judgmentStr}`,
          variant: 'success',
        })
        ctx.events.emit(announceEvent, {
          message: `🎲 ${formula} = ${total}${judgmentStr}`,
        })
      },
    },
  ])
}
