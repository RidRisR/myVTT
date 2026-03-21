import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../engine'
import { PluginSDK, WorkflowRunner } from '../pluginSDK'
import { registerBaseWorkflows, getRollWorkflow } from '../baseWorkflows'

describe('Workflow E2E: daggerheart-core + daggerheart-cosmetic', () => {
  function setup() {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)

    const deps = {
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[8, 5]], total: 15 }),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      sendMessage: vi.fn(),
      showToast: vi.fn(),
    }
    const coreSDK = new PluginSDK(engine, 'daggerheart-core')
    const cosmeticSDK = new PluginSDK(engine, 'daggerheart-cosmetic')
    const runner = new WorkflowRunner(engine, deps)
    return { engine, coreSDK, cosmeticSDK, runner, deps }
  }

  it('full POC flow: generate → dh:judge → cos:animate → dh:resolve → display', async () => {
    const { coreSDK, cosmeticSDK, runner, deps } = setup()
    const executionOrder: string[] = []

    // Simulate daggerheart-core onActivate
    coreSDK.addStep(getRollWorkflow(), {
      id: 'dh:judge',
      after: 'generate',
      run: (ctx) => {
        executionOrder.push('dh:judge')
        const rolls = ctx.data.rolls as number[][]
        const hopeDie = rolls[0]![0]!
        const fearDie = rolls[0]![1]!
        ctx.data.judgment = {
          type: 'daggerheart',
          hopeDie,
          fearDie,
          outcome: hopeDie > fearDie ? 'success_hope' : 'success_fear',
        }
      },
    })

    coreSDK.addStep(getRollWorkflow(), {
      id: 'dh:resolve',
      before: 'display',
      run: (ctx) => {
        executionOrder.push('dh:resolve')
        const j = ctx.data.judgment as { outcome: string }
        if (j.outcome === 'success_fear' || j.outcome === 'failure_fear') {
          ctx.updateTeamTracker('Fear', { current: 1 })
        }
      },
    })

    // Simulate daggerheart-cosmetic onActivate
    cosmeticSDK.addStep(getRollWorkflow(), {
      id: 'cos:dice-animation',
      after: 'dh:judge',
      critical: false,
      run: async (ctx) => {
        executionOrder.push('cos:dice-animation')
        await ctx.playAnimation({
          type: 'dice-roll',
          data: { rolls: ctx.data.rolls },
          durationMs: 100,
        })
      },
    })

    // Verify assembled workflow
    expect(coreSDK.inspectWorkflow(getRollWorkflow())).toEqual([
      'generate',
      'dh:judge',
      'cos:dice-animation',
      'dh:resolve',
      'display',
    ])

    // Execute via WorkflowRunner
    const result = await runner.runWorkflow(getRollWorkflow(), {
      formula: '2d12+2',
      actorId: 'entity-1',
    })

    expect(result.status).toBe('completed')
    expect(executionOrder).toEqual(['dh:judge', 'cos:dice-animation', 'dh:resolve'])
    expect(deps.sendRoll).toHaveBeenCalledWith('2d12+2')
    expect(deps.sendMessage).toHaveBeenCalledWith(expect.stringContaining('2d12+2'))
  })

  it('wrapStep: auto-modifier wraps dh step', async () => {
    const { coreSDK, runner } = setup()

    coreSDK.addStep(getRollWorkflow(), {
      id: 'dh:modifier',
      before: 'generate',
      run: (ctx) => { ctx.data.modifierApplied = 'manual' },
    })

    coreSDK.wrapStep(getRollWorkflow(), 'dh:modifier', {
      run: async (ctx, original) => {
        if (ctx.data.autoMode) {
          ctx.data.modifierApplied = 'auto'
        } else {
          await original(ctx)
        }
      },
    })

    const result = await runner.runWorkflow(getRollWorkflow(), {
      formula: '2d12',
      actorId: 'e1',
      autoMode: true,
    } as never)
    expect(result.status).toBe('completed')
  })

  it('plugin deactivation removes owned steps and cascades dependants', () => {
    const { engine, coreSDK, cosmeticSDK } = setup()

    coreSDK.addStep(getRollWorkflow(), {
      id: 'dh:judge',
      after: 'generate',
      run: () => {},
    })

    // cos:dice-animation depends on dh:judge via attachStep
    cosmeticSDK.attachStep(getRollWorkflow(), {
      id: 'cos:dice-animation',
      to: 'dh:judge',
      critical: false,
      run: () => {},
    })

    expect(engine.inspectWorkflow('roll')).toContain('dh:judge')
    expect(engine.inspectWorkflow('roll')).toContain('cos:dice-animation')

    // Deactivate core — should cascade remove cosmetic's dependent step
    engine.deactivatePlugin('daggerheart-core')
    expect(engine.inspectWorkflow('roll')).not.toContain('dh:judge')
    expect(engine.inspectWorkflow('roll')).not.toContain('cos:dice-animation')
    expect(engine.inspectWorkflow('roll')).toEqual(['generate', 'display'])
  })
})
