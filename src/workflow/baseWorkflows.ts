// src/workflow/baseWorkflows.ts
import type { WorkflowEngine } from './engine'
import type { WorkflowHandle } from './types'

/** Base data shape for the roll workflow */
export interface BaseRollData {
  [key: string]: unknown
  formula: string
  actorId: string
  rolls?: number[][]
  total?: number
}

/** Typed handle — plugins import this to add/attach steps to the roll workflow */
let _rollWorkflow: WorkflowHandle<BaseRollData> | undefined

export function getRollWorkflow(): WorkflowHandle<BaseRollData> {
  if (!_rollWorkflow) {
    throw new Error('rollWorkflow not initialized — call registerBaseWorkflows first')
  }
  return _rollWorkflow
}

export function registerBaseWorkflows(engine: WorkflowEngine): void {
  _rollWorkflow = engine.defineWorkflow<BaseRollData>('roll', [
    {
      id: 'generate',
      run: async (ctx) => {
        const formula = ctx.data.formula
        if (typeof formula !== 'string' || formula.length === 0) {
          ctx.abort('Missing or invalid formula in ctx.data')
          return
        }
        const result = await ctx.serverRoll(formula)
        ctx.data.rolls = result.rolls
        ctx.data.total = result.total
      },
    },
    {
      id: 'display',
      run: (ctx) => {
        const formula = ctx.data.formula
        const total = ctx.data.total
        if (typeof total !== 'number') return
        ctx.showToast(`🎲 ${formula} = ${total}`, { variant: 'success' })
        ctx.announce(`🎲 ${formula} = ${total}`)
      },
    },
  ])
}
