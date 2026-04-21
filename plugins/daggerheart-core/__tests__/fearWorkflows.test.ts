import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK, WorkflowRunner } from '../../../src/workflow/pluginSDK'
import { registerBaseWorkflows } from '../../../src/workflow/baseWorkflows'
import { DaggerHeartCorePlugin } from '../index'
import type { ContextDeps } from '../../../src/workflow/context'

function makeDeps(overrides: Partial<ContextDeps> = {}): Omit<ContextDeps, 'engine'> {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue([[6, 6]]),
    createEntity: vi.fn().mockResolvedValue('test:entity-1'),
    deleteEntity: vi.fn().mockResolvedValue(undefined),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
    getSeatId: vi.fn().mockReturnValue('s1'),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
    ...overrides,
  }
}

function makeSetup(depsOverrides: Partial<ContextDeps> = {}) {
  const engine = new WorkflowEngine()
  registerBaseWorkflows(engine)
  const sdk = new PluginSDK(engine, 'daggerheart-core')
  const deps = makeDeps(depsOverrides)
  const runner = new WorkflowRunner(engine, deps)

  const plugin = new DaggerHeartCorePlugin()
  plugin.onActivate(sdk)

  return { engine, deps, sdk, runner, plugin }
}

describe('fear-set workflow', () => {
  it('registers daggerheart-core:fear-set with a single step', () => {
    const { sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-set')
    const steps = sdk.inspectWorkflow(handle)
    expect(steps).toEqual(['set'])
  })

  it('sets fear to the specified value via updateComponent', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-set')

    await runner.runWorkflow(handle, { value: 7 })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.entityId).toBe('daggerheart-core:fear')
    expect(update.payload.key).toBe('daggerheart-core:fear-tracker')
    expect(update.payload.data).toEqual({ current: 7, max: 12 })
  })

  it('clamps value to max', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-set')

    await runner.runWorkflow(handle, { value: 99 })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.data).toEqual({ current: 12, max: 12 })
  })

  it('clamps value to 0', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-set')

    await runner.runWorkflow(handle, { value: -5 })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.data).toEqual({ current: 0, max: 12 })
  })
})

describe('fear-clear workflow', () => {
  it('registers daggerheart-core:fear-clear with a single step', () => {
    const { sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-clear')
    const steps = sdk.inspectWorkflow(handle)
    expect(steps).toEqual(['clear'])
  })

  it('sets fear to 0', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-clear')

    await runner.runWorkflow(handle, {})

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.data).toEqual({ current: 0, max: 12 })
  })
})
