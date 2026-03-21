// src/workflow/baseWorkflows.ts
import type { WorkflowEngine } from './engine'
import type { WorkflowHandle } from './types'

/** Base data shape for the roll workflow */
export interface BaseRollData {
  formula: string
  actorId: string
  rolls?: number[][]
  total?: number
}

/** Typed handle — plugins import this to add/attach steps to the roll workflow */
export let rollWorkflow: WorkflowHandle<BaseRollData>

export function registerBaseWorkflows(engine: WorkflowEngine): void {
  rollWorkflow = engine.defineWorkflow<BaseRollData>('roll', [
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
        const formula = ctx.data.formula as string
        const total = ctx.data.total
        if (typeof total !== 'number') return
        ctx.showToast(`🎲 ${formula} = ${total}`, { variant: 'success' })
        ctx.announce(`🎲 ${formula} = ${total}`)
      },
    },
  ])
}
