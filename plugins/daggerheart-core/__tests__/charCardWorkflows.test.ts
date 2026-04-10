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

describe('charcard:update-attr workflow', () => {
  it('is registered on the engine via daggerheart-core:charcard-update-attr', () => {
    const { sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:charcard-update-attr')
    const steps = sdk.inspectWorkflow(handle)
    expect(steps).toEqual(['update'])
  })

  it('updates a single attribute on the entity', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:charcard-update-attr')

    await runner.runWorkflow(handle, {
      entityId: 'char1',
      attribute: 'agility',
      value: 3,
    })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.entityId).toBe('char1')
    expect(update.payload.key).toBe('daggerheart:attributes')
    expect(update.payload.data).toEqual({
      agility: 3,
      strength: 0,
      finesse: 0,
      instinct: 0,
      presence: 0,
      knowledge: 0,
    })
  })

  it('ignores invalid attribute names', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:charcard-update-attr')

    await runner.runWorkflow(handle, {
      entityId: 'char1',
      attribute: 'invalidattr',
      value: 5,
    })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(0)
  })
})
