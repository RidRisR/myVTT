// src/workflow/baseWorkflows.ts
import type { WorkflowEngine } from './engine'

export function registerBaseWorkflows(engine: WorkflowEngine): void {
  engine.defineWorkflow('roll', [
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
