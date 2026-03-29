import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../engine'
import { PluginSDK, WorkflowRunner } from '../pluginSDK'
import { registerBaseWorkflows } from '../baseWorkflows'
import { createEventBus } from '../../events/eventBus'
import { toastEvent, announceEvent, animationEvent } from '../../events/systemEvents'
import type { WorkflowHandle } from '../types'
import { tokenizeExpression, toDiceSpecs, buildCompoundResult } from '../../shared/diceUtils'

describe('Workflow E2E: daggerheart-core + daggerheart-cosmetic', () => {
  function setup() {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)

    const bus = createEventBus()
    const deps = {
      emitEntry: vi.fn(),
      serverRoll: vi.fn().mockResolvedValue({
        seq: 1,
        id: 'roll-1',
        type: 'core:roll-result',
        origin: { seat: { id: 's1', name: 'GM', color: '#fff' } },
        executor: 's1',
        chainDepth: 0,
        triggerable: true,
        visibility: {},
        baseSeq: 0,
        timestamp: Date.now(),
        payload: { rolls: [[8, 5]], total: 15, formula: '2d12+2', dice: [{ sides: 12, count: 2 }] },
      }),
      getEntity: vi.fn(),
      getAllEntities: vi.fn().mockReturnValue({}),
      eventBus: bus,
      getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
      getSeatId: vi.fn().mockReturnValue('s1'),
      getLogWatermark: vi.fn().mockReturnValue(0),
      getFormulaTokens: vi.fn().mockReturnValue({}),
    }
    const coreSDK = new PluginSDK(engine, 'daggerheart-core')
    const cosmeticSDK = new PluginSDK(engine, 'daggerheart-cosmetic')
    const runner = new WorkflowRunner(engine, deps)
    return { engine, coreSDK, cosmeticSDK, runner, deps, bus }
  }

  it('full POC flow: dh:action-check composes roll + judge + resolve + display', async () => {
    const { coreSDK, cosmeticSDK, runner, deps, bus } = setup()
    const executionOrder: string[] = []

    const toasts: unknown[] = []
    const announcements: unknown[] = []
    bus.on(toastEvent, (p) => toasts.push(p))
    bus.on(announceEvent, (p) => announcements.push(p))

    // daggerheart-core defines its own workflow with inlined roll logic
    const dhWorkflow = coreSDK.defineWorkflow<{
      [key: string]: unknown
      formula: string
      actorId: string
      rolls?: number[][]
      total?: number
    }>('dh:action-check', [
      {
        id: 'roll',
        run: async (ctx) => {
          const formula = ctx.vars.formula
          if (!formula) { ctx.abort('Missing formula'); return }

          const finalFormula = formula as string
          const terms = tokenizeExpression(finalFormula)
          if (!terms) { ctx.abort(`Cannot parse: ${finalFormula}`); return }
          const dice = toDiceSpecs(terms)

          const entry = await ctx.serverRoll(formula as string, { dice })
          const rolls = entry.payload.rolls as number[][]
          const { total } = buildCompoundResult(terms, rolls)
          ctx.vars.rolls = rolls
          ctx.vars.total = total
        },
      },
      {
        id: 'dh:judge',
        run: (ctx) => {
          executionOrder.push('dh:judge')
          const rolls = ctx.vars.rolls as number[][]
          const hopeDie = rolls[0]![0]!
          const fearDie = rolls[0]![1]!
          ctx.vars.judgment = {
            type: 'daggerheart',
            outcome: hopeDie > fearDie ? 'success_hope' : 'success_fear',
          }
        },
      },
      {
        id: 'dh:resolve',
        run: (ctx) => {
          executionOrder.push('dh:resolve')
          const j = ctx.vars.judgment as { outcome: string }
          if (j.outcome === 'success_fear' || j.outcome === 'failure_fear') {
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing deprecated API
            ctx.updateTeamTracker('Fear', { current: 1 })
          }
        },
      },
      {
        id: 'display',
        run: (ctx) => {
          executionOrder.push('display')
          const total = ctx.vars.total
          if (typeof total !== 'number') return
          ctx.events.emit(toastEvent, {
            text: `🎲 ${ctx.vars.formula} = ${total}`,
            variant: 'success' as const,
          })
          ctx.events.emit(announceEvent, {
            message: `🎲 ${ctx.vars.formula} = ${total}`,
          })
        },
      },
    ])

    // cosmetic attaches to dh:action-check, not roll
    cosmeticSDK.attachStep(dhWorkflow, {
      id: 'cos:dice-animation',
      to: 'dh:judge',
      readonly: true,
      critical: false,
      run: (ctx) => {
        executionOrder.push('cos:dice-animation')
        ctx.events.emit(animationEvent, {
          type: 'dice-roll',
          data: { rolls: ctx.vars.rolls },
          durationMs: 100,
        })
      },
    })

    // Verify assembled dh:action-check
    expect(coreSDK.inspectWorkflow(dhWorkflow)).toEqual([
      'roll',
      'dh:judge',
      'cos:dice-animation',
      'dh:resolve',
      'display',
    ])

    // Execute
    const result = await runner.runWorkflow(dhWorkflow, {
      formula: '2d12+2',
      actorId: 'entity-1',
    })

    expect(result.status).toBe('completed')
    expect(executionOrder).toEqual(['dh:judge', 'cos:dice-animation', 'dh:resolve', 'display'])
    expect(deps.serverRoll).toHaveBeenCalledWith(expect.objectContaining({ formula: '2d12+2' }))
    expect(toasts).toEqual([expect.objectContaining({ text: expect.stringContaining('2d12+2') })])
  })

  it('wrapStep: auto-modifier wraps dh step', async () => {
    const { coreSDK, runner } = setup()

    // Define a simple workflow to test wrapStep
    const testWf = coreSDK.defineWorkflow<{
      [key: string]: unknown
      formula: string
      actorId: string
      modifierApplied?: string
      autoMode?: boolean
    }>('test:wrap', [
      {
        id: 'modifier',
        run: (ctx) => {
          ctx.vars.modifierApplied = 'manual'
        },
      },
      {
        id: 'generate',
        run: () => {},
      },
    ])

    coreSDK.wrapStep(testWf, 'modifier', {
      run: async (ctx, original) => {
        if (ctx.vars.autoMode) {
          ctx.vars.modifierApplied = 'auto'
        } else {
          await original(ctx)
        }
      },
    })

    const result = await runner.runWorkflow(testWf, {
      formula: '2d12',
      actorId: 'e1',
      autoMode: true,
    })
    expect(result.status).toBe('completed')
  })

  it('plugin deactivation removes owned steps and cascades dependants', () => {
    const { engine, coreSDK, cosmeticSDK } = setup()

    // core defines dh:action-check
    const dhWf = coreSDK.defineWorkflow('dh:action-check-deact', [
      { id: 'roll', run: () => {} },
      { id: 'dh:judge', run: () => {} },
      { id: 'display', run: () => {} },
    ])

    // cosmetic attaches to dh:judge
    cosmeticSDK.attachStep(
      dhWf as WorkflowHandle<Record<string, unknown>, unknown> as WorkflowHandle,
      {
        id: 'cos:dice-animation',
        to: 'dh:judge',
        readonly: true,
        critical: false,
        run: () => {},
      },
    )

    expect(engine.inspectWorkflow('dh:action-check-deact')).toContain('dh:judge')
    expect(engine.inspectWorkflow('dh:action-check-deact')).toContain('cos:dice-animation')

    // Deactivate core — should cascade remove cosmetic's dependent step
    engine.deactivatePlugin('daggerheart-core')
    // Core-owned steps removed, cosmetic dependent also removed
    expect(engine.inspectWorkflow('dh:action-check-deact')).not.toContain('dh:judge')
    expect(engine.inspectWorkflow('dh:action-check-deact')).not.toContain('cos:dice-animation')
  })
})
