// src/workflow/baseWorkflows.ts
import type { WorkflowEngine } from './engine'
import type { WorkflowHandle } from './types'
import { toastEvent, announceEvent } from '../events/systemEvents'
import { _setSelection } from '../stores/sessionStore'

/** Base data shape for the roll workflow */
export interface BaseRollData {
  [key: string]: unknown
  formula: string
  actorId: string
  rolls?: number[][]
  total?: number
}

/** Data shape for the set-selection workflow */
export interface SetSelectionState {
  [key: string]: unknown
  entityId: string | null
}

/** Typed handle — plugins import this to add/attach steps to the roll workflow */
let _rollWorkflow: WorkflowHandle<BaseRollData> | undefined
let _setSelectionWorkflow: WorkflowHandle<SetSelectionState> | undefined

export function getRollWorkflow(): WorkflowHandle<BaseRollData> {
  if (!_rollWorkflow) {
    throw new Error('rollWorkflow not initialized — call registerBaseWorkflows first')
  }
  return _rollWorkflow
}

export function getSetSelectionWorkflow(): WorkflowHandle<SetSelectionState> {
  if (!_setSelectionWorkflow) {
    throw new Error('setSelectionWorkflow not initialized — call registerBaseWorkflows first')
  }
  return _setSelectionWorkflow
}

export function registerBaseWorkflows(engine: WorkflowEngine): void {
  _rollWorkflow = engine.defineWorkflow<BaseRollData>('roll', [
    {
      id: 'generate',
      run: async (ctx) => {
        const formula = ctx.state.formula
        if (typeof formula !== 'string' || formula.length === 0) {
          ctx.abort('Missing or invalid formula in ctx.state')
          return
        }
        const result = await ctx.serverRoll(formula)
        ctx.state.rolls = result.rolls
        ctx.state.total = result.total
      },
    },
    {
      id: 'display',
      run: (ctx) => {
        const formula = ctx.state.formula
        const total = ctx.state.total
        if (typeof total !== 'number') return
        ctx.events.emit(toastEvent, { text: `🎲 ${formula} = ${total}`, variant: 'success' })
        ctx.events.emit(announceEvent, { message: `🎲 ${formula} = ${total}` })
      },
    },
  ])

  _setSelectionWorkflow = engine.defineWorkflow<SetSelectionState>('core:set-selection', (ctx) => {
    _setSelection(ctx.state.entityId ? [ctx.state.entityId] : [])
  })
}
