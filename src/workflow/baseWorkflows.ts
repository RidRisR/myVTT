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

/** Structured output from the roll workflow */
export interface RollOutput {
  rolls: number[][]
  total: number
}

/** Data shape for the set-selection workflow */
export interface SetSelectionState {
  [key: string]: unknown
  entityId: string | null
}

/** Typed handle — plugins import this to add/attach steps to the roll workflow */
let _rollWorkflow: WorkflowHandle<BaseRollData, RollOutput> | undefined
let _quickRollWorkflow: WorkflowHandle<BaseRollData> | undefined
let _setSelectionWorkflow: WorkflowHandle<SetSelectionState> | undefined

export function getRollWorkflow(): WorkflowHandle<BaseRollData, RollOutput> {
  if (!_rollWorkflow) {
    throw new Error('rollWorkflow not initialized — call registerBaseWorkflows first')
  }
  return _rollWorkflow
}

export function getQuickRollWorkflow(): WorkflowHandle<BaseRollData> {
  if (!_quickRollWorkflow) {
    throw new Error('quickRollWorkflow not initialized — call registerBaseWorkflows first')
  }
  return _quickRollWorkflow
}

export function getSetSelectionWorkflow(): WorkflowHandle<SetSelectionState> {
  if (!_setSelectionWorkflow) {
    throw new Error('setSelectionWorkflow not initialized — call registerBaseWorkflows first')
  }
  return _setSelectionWorkflow
}

export function registerBaseWorkflows(engine: WorkflowEngine): void {
  // roll: pure dice generation with structured output, no display
  _rollWorkflow = engine.defineWorkflow<BaseRollData, RollOutput>(
    'roll',
    [
      {
        id: 'generate',
        run: async (ctx) => {
          const formula = ctx.vars.formula
          if (typeof formula !== 'string' || formula.length === 0) {
            ctx.abort('Missing or invalid formula in ctx.vars')
            return
          }
          const result = await ctx.serverRoll(formula)
          ctx.vars.rolls = result.rolls
          ctx.vars.total = result.total
        },
      },
    ],
    (vars) => ({ rolls: vars.rolls ?? [], total: vars.total ?? 0 }),
  )

  // quick-roll: compose roll + display (chat box, general use)
  _quickRollWorkflow = engine.defineWorkflow<BaseRollData>('quick-roll', [
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
      id: 'display',
      run: (ctx) => {
        const formula = ctx.vars.formula
        const total = ctx.vars.total
        if (typeof total !== 'number') return
        ctx.events.emit(toastEvent, { text: `🎲 ${formula} = ${total}`, variant: 'success' })
        ctx.events.emit(announceEvent, { message: `🎲 ${formula} = ${total}` })
      },
    },
  ])

  _setSelectionWorkflow = engine.defineWorkflow<SetSelectionState>('core:set-selection', (ctx) => {
    _setSelection(ctx.vars.entityId ? [ctx.vars.entityId] : [])
  })
}
