// plugins/daggerheart-core/rollSteps.ts
import type React from 'react'
import type { IPluginSDK, WorkflowHandle, JudgmentResult } from '@myvtt/sdk'
import { tokenizeExpression, toDiceSpecs, buildCompoundResult, toastEvent } from '@myvtt/sdk'
import { dhEvaluateRoll } from '../daggerheart/diceSystem'
import { DHJudgmentRenderer } from './DHJudgmentRenderer'

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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- formula absent when invoked via command system
        const formula = ctx.vars.formula ?? (ctx.vars.raw as string | undefined)
        if (!formula) {
          ctx.abort('Missing formula')
          return
        }
        ctx.vars.formula = formula

        // Resolve @tokens if present
        let resolved = ctx.vars.resolvedFormula as string | undefined
        if (!resolved && /@[\p{L}\p{N}_]+/u.test(formula)) {
          const tokens = ctx.read.formulaTokens(ctx.vars.actorId)
          resolved = formula.replace(/@([\p{L}\p{N}_]+)/gu, (_, key: string) => {
            const val = tokens[key]
            return val !== undefined ? String(val) : `@${key}`
          })
          ctx.vars.resolvedFormula = resolved
        }

        // Tokenize + server roll
        const finalFormula = resolved ?? formula
        const terms = tokenizeExpression(finalFormula)
        if (!terms) {
          ctx.abort(`Cannot parse: ${finalFormula}`)
          return
        }
        const dice = toDiceSpecs(terms)

        const entry = await ctx.serverRoll(formula, {
          dice,
          resolvedFormula: resolved,
          rollType: ctx.vars.rollType as string | undefined,
          actionName: ctx.vars.actionName as string | undefined,
        })

        const rolls = entry.payload.rolls as number[][]
        const { total } = buildCompoundResult(terms, rolls)
        ctx.vars.rolls = rolls
        ctx.vars.total = total
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
      id: 'dh:emit-judgment',
      run: (ctx) => {
        const judgment = ctx.vars.judgment as { type: string; outcome: string } | undefined
        if (!judgment) return
        ctx.emitEntry({
          type: 'dh:judgment',
          payload: {
            formula: ctx.vars.formula,
            rolls: ctx.vars.rolls as number[][],
            total: ctx.vars.total as number,
            judgment,
          },
          triggerable: true,
        })
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
      },
    },
  ])

  sdk.registerCommand('.dd', _actionCheckWorkflow)
  sdk.ui.registerRenderer(
    'chat',
    'dh:judgment',
    DHJudgmentRenderer as React.ComponentType<{ entry: unknown; isNew?: boolean }>,
  )
}
