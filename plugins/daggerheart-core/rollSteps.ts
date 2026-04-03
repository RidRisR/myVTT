// plugins/daggerheart-core/rollSteps.ts
import type { IPluginSDK, WorkflowHandle, JudgmentResult } from '@myvtt/sdk'
import { rollResult } from '@myvtt/sdk'
import { dhEvaluateRoll } from '../daggerheart/diceSystem'

/** Data shape for the dh:judgment sub-workflow */
export interface DHJudgmentData {
  [key: string]: unknown
  rolls: number[][]
  total: number
  judgment?: JudgmentResult
}

/** Data shape for the dh:action-check workflow */
export interface DHActionCheckData {
  [key: string]: unknown
  formula: string
  actorId: string
  rolls?: number[][]
  total?: number
  judgment?: JudgmentResult
}

let _judgmentWorkflow: WorkflowHandle<DHJudgmentData> | undefined
let _actionCheckWorkflow: WorkflowHandle<DHActionCheckData> | undefined

export function getDHJudgmentWorkflow(): WorkflowHandle<DHJudgmentData> {
  if (!_judgmentWorkflow) {
    throw new Error('dh:judgment not initialized — call registerDHCoreSteps first')
  }
  return _judgmentWorkflow
}

export function getDHActionCheckWorkflow(): WorkflowHandle<DHActionCheckData> {
  if (!_actionCheckWorkflow) {
    throw new Error('dh:action-check not initialized — call registerDHCoreSteps first')
  }
  return _actionCheckWorkflow
}

export function registerDHCoreSteps(sdk: IPluginSDK): void {
  // Reusable sub-workflow: judgment computation + tracker update
  _judgmentWorkflow = sdk.defineWorkflow<DHJudgmentData>('dh:judgment', [
    {
      id: 'judge',
      run: (ctx) => {
        const { rolls, total } = ctx.vars
        const judgment = dhEvaluateRoll(rolls, total)
        if (judgment) {
          ctx.vars.judgment = judgment
        }
      },
    },
    {
      id: 'resolve',
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
  ])

  // Composite workflow: roll + judgment + display
  _actionCheckWorkflow = sdk.defineWorkflow<DHActionCheckData>('dh:action-check', [
    {
      id: 'roll',
      run: async (ctx) => {
        // When invoked via command system (.dd), raw is the modifier expression (e.g., "@agility" or "+3").
        // When invoked via character card, formula is already complete (e.g., "2d12+@agility").
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- formula absent when invoked via command system
        let formula = ctx.vars.formula ?? (ctx.vars.raw as string | undefined)
        if (!formula) {
          // No argument at all — default Daggerheart roll
          formula = '2d12'
        }
        // If formula doesn't contain dice notation, treat it as a modifier to 2d12
        if (!/\d+d\d+/i.test(formula)) {
          const mod = formula.trim()
          formula = mod.startsWith('+') || mod.startsWith('-') ? `2d12${mod}` : `2d12+${mod}`
        }
        ctx.vars.formula = formula
        ctx.vars.rollType = 'daggerheart:dd'

        // Direct serverRoll — Daggerheart always rolls 2d12
        const rolls = await ctx.serverRoll([{ sides: 12, count: 2 }])
        ctx.vars.rolls = rolls
        ctx.vars.total = rolls.flat().reduce((a, b) => a + b, 0)
      },
    },
    {
      id: 'judgment',
      run: async (ctx) => {
        const rolls = ctx.vars.rolls
        const total = ctx.vars.total
        if (!rolls || total == null) return
        const result = await ctx.runWorkflow(getDHJudgmentWorkflow(), { rolls, total })
        if (result.status === 'completed') {
          ctx.vars.judgment = result.output.judgment
        }
      },
    },
  ])

  sdk.registerCommand('.dd', _actionCheckWorkflow)

  // Register rollResult config for daggerheart:dd
  sdk.ui.registerRenderer(rollResult('daggerheart:dd'), {
    dieConfigs: [
      { color: '#fbbf24', label: 'die.hope' },
      { color: '#dc2626', label: 'die.fear' },
    ],
  })
}
