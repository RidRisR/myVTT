// src/workflow/pluginSDK.test.ts
import { describe, it, expect, vi } from 'vitest'
import { PluginSDK, WorkflowRunner } from './pluginSDK'
import { WorkflowEngine } from './engine'
import { createEventBus } from '../events/eventBus'
import type { ContextDeps } from './context'

function makeDeps(): Omit<ContextDeps, 'engine'> {
  return {
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
      payload: { rolls: [[4]], total: 4, formula: '1d6', dice: [{ sides: 6, count: 1 }] },
    }),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    eventBus: createEventBus(),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
    getSeatId: vi.fn().mockReturnValue('s1'),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
  }
}

function makeSDK() {
  const engine = new WorkflowEngine()
  const sdk = new PluginSDK(engine, 'test-plugin')
  return { sdk, engine }
}

function makeRunner() {
  const engine = new WorkflowEngine()
  const deps = makeDeps()
  const runner = new WorkflowRunner(engine, deps)
  return { runner, engine, deps }
}

describe('PluginSDK', () => {
  it('addStep delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const addStepSpy = vi.spyOn(engine, 'addStep')
    sdk.addStep(handle, { id: 'b', after: 'a', run: () => {} })
    expect(addStepSpy).toHaveBeenCalledWith(
      'wf',
      expect.objectContaining({ id: 'b' }),
      'test-plugin',
    )
  })

  it('attachStep delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const attachSpy = vi.spyOn(engine, 'attachStep')
    sdk.attachStep(handle, { id: 'dep', to: 'a', run: () => {} })
    expect(attachSpy).toHaveBeenCalledWith(
      'wf',
      expect.objectContaining({ id: 'dep' }),
      'test-plugin',
    )
  })

  it('wrapStep delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const wrapSpy = vi.spyOn(engine, 'wrapStep')
    const opts = { run: vi.fn() }
    sdk.wrapStep(handle, 'a', opts)
    expect(wrapSpy).toHaveBeenCalledWith('wf', 'a', opts, 'test-plugin')
  })

  it('replaceStep delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const replaceSpy = vi.spyOn(engine, 'replaceStep')
    const opts = { run: () => {} }
    sdk.replaceStep(handle, 'a', opts)
    expect(replaceSpy).toHaveBeenCalledWith('wf', 'a', opts, 'test-plugin')
  })

  it('removeStep delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const removeSpy = vi.spyOn(engine, 'removeStep')
    sdk.removeStep(handle, 'a')
    expect(removeSpy).toHaveBeenCalledWith('wf', 'a')
  })

  it('inspectWorkflow delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    expect(sdk.inspectWorkflow(handle)).toEqual(['a'])
  })
})

describe('WorkflowRunner', () => {
  it('runWorkflow creates context with initial state and returns result', async () => {
    const { runner, engine } = makeRunner()
    let capturedState: Record<string, unknown> = {}
    const handle = engine.defineWorkflow('run-test', [
      {
        id: 'capture',
        run: (ctx) => {
          capturedState = ctx.vars
        },
      },
    ])
    const result = await runner.runWorkflow(handle, { value: 99 })
    expect(capturedState).toEqual({ value: 99 })
    expect(result.status).toBe('completed')
  })

  it('runWorkflow with no data creates context with empty state', async () => {
    const { runner, engine } = makeRunner()
    let capturedState: Record<string, unknown> = { placeholder: true }
    const handle = engine.defineWorkflow('empty-data', [
      {
        id: 'capture',
        run: (ctx) => {
          capturedState = ctx.vars
        },
      },
    ])
    await runner.runWorkflow(handle)
    expect(capturedState).toEqual({})
  })

  it('runWorkflow returns errors from non-critical steps', async () => {
    const { runner, engine } = makeRunner()
    const handle = engine.defineWorkflow('errors', [
      {
        id: 'fail',
        readonly: true,
        critical: false,
        run: () => {
          throw new Error('oops')
        },
      },
      { id: 'ok', run: () => {} },
    ])
    const result = await runner.runWorkflow(handle)
    expect(result.status).toBe('completed')
    expect(result.errors).toHaveLength(1)
  })

  it('each runWorkflow call gets independent depth tracking', async () => {
    const { runner, engine } = makeRunner()
    const handle = engine.defineWorkflow('concurrent', [{ id: 'a', run: () => {} }])
    // Both should succeed independently
    const [r1, r2] = await Promise.all([runner.runWorkflow(handle), runner.runWorkflow(handle)])
    expect(r1.status).toBe('completed')
    expect(r2.status).toBe('completed')
  })
})

describe('PluginSDK + deactivatePlugin', () => {
  it('deactivatePlugin cleans up wrappers registered via SDK', async () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, 'plugin-x')
    const order: string[] = []

    const handle = engine.defineWorkflow('deact-wrap', [
      {
        id: 'target',
        run: () => {
          order.push('original')
        },
      },
    ])

    sdk.wrapStep(handle, 'target', {
      run: (ctx, original) => {
        order.push('wrapper')
        return original(ctx)
      },
    })

    // Run with wrapper active
    const runner = new WorkflowRunner(engine, makeDeps())
    await runner.runWorkflow(handle)
    expect(order).toEqual(['wrapper', 'original'])

    // Deactivate plugin and run again
    order.length = 0
    engine.deactivatePlugin('plugin-x')
    await runner.runWorkflow(handle)
    expect(order).toEqual(['original'])
  })

  it('deactivatePlugin restores replaced steps registered via SDK', async () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, 'plugin-y')
    const order: string[] = []

    const handle = engine.defineWorkflow('deact-repl', [
      {
        id: 'target',
        run: () => {
          order.push('original')
        },
      },
    ])

    sdk.replaceStep(handle, 'target', {
      run: () => {
        order.push('replaced')
      },
    })

    const runner = new WorkflowRunner(engine, makeDeps())
    await runner.runWorkflow(handle)
    expect(order).toEqual(['replaced'])

    order.length = 0
    engine.deactivatePlugin('plugin-y')
    await runner.runWorkflow(handle)
    expect(order).toEqual(['original'])
  })
})
