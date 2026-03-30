// src/workflow/baseWorkflows.ts
import type { WorkflowEngine } from './engine'
import type { WorkflowHandle } from './types'
import { tokenizeExpression, toDiceSpecs, buildCompoundResult } from '../shared/diceUtils'
import { toastEvent, announceEvent } from '../events/systemEvents'
import { _setSelection } from '../stores/sessionStore'
import { registerCommand } from './commandRegistry'

/** Base data shape for the roll workflow */
export interface BaseRollData {
  [key: string]: unknown
  formula: string
  actorId: string
  resolvedFormula?: string
  rolls?: number[][]
  total?: number
}

/** Data shape for the set-selection workflow */
export interface SetSelectionState {
  [key: string]: unknown
  entityId: string | null
}

/** Data shape for the send-text workflow */
export interface SendTextData {
  [key: string]: unknown
  content: string
  senderName?: string
}

/** Output shape of the reusable roll workflow */
export interface RollOutput {
  rolls: number[][]
  total: number
}

let _rollWorkflow: WorkflowHandle<BaseRollData, RollOutput> | undefined
let _quickRollWorkflow: WorkflowHandle<BaseRollData> | undefined
let _setSelectionWorkflow: WorkflowHandle<SetSelectionState> | undefined
let _sendTextWorkflow: WorkflowHandle<SendTextData> | undefined

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

export function getSendTextWorkflow(): WorkflowHandle<SendTextData> {
  if (!_sendTextWorkflow) {
    throw new Error('sendTextWorkflow not initialized — call registerBaseWorkflows first')
  }
  return _sendTextWorkflow
}

export function registerBaseWorkflows(engine: WorkflowEngine): void {
  // roll: reusable roll workflow — resolves @tokens, tokenizes, server-rolls, computes total
  _rollWorkflow = engine.defineWorkflow<BaseRollData, RollOutput>(
    'roll',
    [
      {
        id: 'generate',
        run: async (ctx) => {
          const formula = ctx.vars.formula
          if (typeof formula !== 'string' || formula.length === 0) {
            ctx.abort('Missing or invalid formula')
            return
          }

          let resolved = ctx.vars.resolvedFormula
          if (!resolved && /@[\p{L}\p{N}_]+/u.test(formula)) {
            const tokens = ctx.read.formulaTokens(ctx.vars.actorId)
            resolved = formula.replace(/@([\p{L}\p{N}_]+)/gu, (_, key: string) => {
              const val = tokens[key]
              return val !== undefined ? String(val) : `@${key}`
            })
            ctx.vars.resolvedFormula = resolved
          }

          const finalFormula = resolved ?? formula
          const terms = tokenizeExpression(finalFormula)
          if (!terms) {
            ctx.abort(`Cannot parse formula: ${finalFormula}`)
            return
          }
          const dice = toDiceSpecs(terms)

          const entry = await ctx.serverRoll(formula, {
            dice,
            resolvedFormula: resolved,
            rollType: ctx.vars.rollType as string | undefined,
          })

          const rolls = entry.payload.rolls as number[][]
          const { total } = buildCompoundResult(terms, rolls)
          ctx.vars.rolls = rolls
          ctx.vars.total = total
        },
      },
    ],
    (vars) => ({ rolls: vars.rolls ?? [], total: vars.total ?? 0 }),
  )

  // quick-roll: delegates to roll workflow + display (chat box, general use)
  _quickRollWorkflow = engine.defineWorkflow<BaseRollData>('quick-roll', [
    {
      id: 'roll',
      run: async (ctx) => {
        // Support both direct calls (formula) and command system (raw)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- formula absent when invoked via command system
        const formula = ctx.vars.formula ?? (ctx.vars.raw as string | undefined)
        if (!formula) {
          ctx.abort('Missing formula')
          return
        }
        ctx.vars.formula = formula

        const result = await ctx.runWorkflow(getRollWorkflow(), {
          formula,
          actorId: ctx.vars.actorId,
          resolvedFormula: ctx.vars.resolvedFormula,
        })
        if (result.status === 'completed') {
          ctx.vars.rolls = result.output.rolls
          ctx.vars.total = result.output.total
        } else {
          ctx.abort(result.reason ?? 'Roll failed')
        }
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

  // send-text: emit a plain text chat message into game_log
  _sendTextWorkflow = engine.defineWorkflow<SendTextData>('core:send-text', [
    {
      id: 'emit',
      run: (ctx) => {
        const content = ctx.vars.content
        if (typeof content !== 'string' || content.length === 0) return
        ctx.emitEntry({
          type: 'core:text',
          payload: { content, senderName: ctx.vars.senderName },
          triggerable: true,
        })
      },
    },
  ])

  // Register chat commands
  registerCommand('.r', _quickRollWorkflow)
  registerCommand('.roll', _quickRollWorkflow)
}
