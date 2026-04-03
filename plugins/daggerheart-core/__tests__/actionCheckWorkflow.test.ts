// plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK, WorkflowRunner } from '../../../src/workflow/pluginSDK'
import { registerBaseWorkflows } from '../../../src/workflow/baseWorkflows'
import { DaggerHeartCorePlugin } from '../index'
import type { ContextDeps } from '../../../src/workflow/context'

function makeDeps(overrides: Partial<ContextDeps> = {}): Omit<ContextDeps, 'engine'> {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue([[8, 5]]),
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

describe('DaggerHeartCorePlugin action-check workflow', () => {
  it('registers daggerheart-core:action-check with correct steps', () => {
    const { sdk, plugin } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:action-check')
    const steps = sdk.inspectWorkflow(handle)
    expect(steps).toEqual(['modifier', 'roll', 'judge', 'emit', 'resolve'])
    // Plugin id should be correct
    expect(plugin.id).toBe('daggerheart-core')
  })

  it('full flow emits daggerheart-core:action-check entry with expected payload', async () => {
    const { runner, deps, sdk } = makeSetup({
      serverRoll: vi.fn().mockResolvedValue([[8, 5]]),
    })
    const handle = sdk.getWorkflow('daggerheart-core:action-check')

    const result = await runner.runWorkflow(handle, {
      formula: '2d12',
      actorId: 'actor-1',
      skipModifier: true,
      dc: 12,
    })

    expect(result.status).toBe('completed')
    expect(deps.serverRoll).toHaveBeenCalledWith(
      expect.objectContaining({ dice: [{ sides: 12, count: 2 }] }),
    )

    // Check emitEntry was called with the action-check entry
    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const actionCheckEntries = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'daggerheart-core:action-check',
    )
    expect(actionCheckEntries).toHaveLength(1)
    const entry = actionCheckEntries[0]![0] as {
      type: string
      payload: Record<string, unknown>
    }
    expect(entry.type).toBe('daggerheart-core:action-check')
    expect(entry.payload).toMatchObject({
      formula: '2d12',
      rolls: [[8, 5]],
      total: 13,
      dc: 12,
      dieConfigs: [
        { color: '#fbbf24', label: 'die.hope' },
        { color: '#dc2626', label: 'die.fear' },
      ],
    })
    // Judgment should be present: 8 > 5 → hope wins, total 13 >= dc 12 → success_hope
    expect(entry.payload.judgment).toMatchObject({
      type: 'daggerheart',
      outcome: 'success_hope',
    })
    expect(entry.payload.display).toMatchObject({
      text: 'judgment.successHope',
    })
  })

  it('hope outcome calls updateComponent on actor entity', async () => {
    // rolls [[9, 4]] → hope die 9 > fear die 4, total 13 >= dc 12 → success_hope
    const { runner, deps, sdk } = makeSetup({
      serverRoll: vi.fn().mockResolvedValue([[9, 4]]),
    })
    const handle = sdk.getWorkflow('daggerheart-core:action-check')

    await runner.runWorkflow(handle, {
      formula: '2d12',
      actorId: 'actor-1',
      skipModifier: true,
      dc: 12,
    })

    // HopeResolver calls ctx.updateComponent(actorId, 'daggerheart:extras', updater)
    // which internally emits a core:component-update entry
    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.entityId).toBe('actor-1')
    expect(update.payload.key).toBe('daggerheart:extras')
    // The updater receives undefined (no existing component) and produces { hope: 1 }
    expect(update.payload.data).toEqual({ hope: 1 })
  })

  it('fear outcome calls updateComponent on fear entity', async () => {
    // rolls [[4, 9]] → hope die 4 < fear die 9, total 13 >= dc 12 → success_fear
    const { runner, deps, sdk } = makeSetup({
      serverRoll: vi.fn().mockResolvedValue([[4, 9]]),
    })
    const handle = sdk.getWorkflow('daggerheart-core:action-check')

    await runner.runWorkflow(handle, {
      formula: '2d12',
      actorId: 'actor-1',
      skipModifier: true,
      dc: 12,
    })

    // FearManager calls ctx.updateComponent('daggerheart-core:fear', 'daggerheart-core:fear-tracker', updater)
    // which internally emits a core:component-update entry
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
    // The updater receives undefined (no entity found by getEntity mock) and produces { current: 1, max: 10 }
    expect(update.payload.data).toEqual({ current: 1, max: 10 })
  })

  it('failure_hope outcome still triggers hope resolve', async () => {
    // rolls [[5, 3]] → hope die 5 > fear die 3, total 8 < dc 12 → failure_hope
    const { runner, deps, sdk } = makeSetup({
      serverRoll: vi.fn().mockResolvedValue([[5, 3]]),
    })
    const handle = sdk.getWorkflow('daggerheart-core:action-check')

    await runner.runWorkflow(handle, {
      formula: '2d12',
      actorId: 'actor-1',
      skipModifier: true,
      dc: 12,
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
    expect(update.payload.entityId).toBe('actor-1')
    expect(update.payload.key).toBe('daggerheart:extras')
  })

  it('critical_success does not trigger hope or fear resolve', async () => {
    // rolls [[6, 6]] → doubles → critical_success
    const { runner, deps, sdk } = makeSetup({
      serverRoll: vi.fn().mockResolvedValue([[6, 6]]),
    })
    const handle = sdk.getWorkflow('daggerheart-core:action-check')

    await runner.runWorkflow(handle, {
      formula: '2d12',
      actorId: 'actor-1',
      skipModifier: true,
      dc: 12,
    })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    // Critical success should NOT emit component updates (no hope/fear)
    expect(componentUpdates).toHaveLength(0)
  })

  it('skips modifier step when skipModifier is true', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:action-check')

    const result = await runner.runWorkflow(handle, {
      formula: '2d12',
      actorId: 'actor-1',
      skipModifier: true,
      dc: 15,
    })

    expect(result.status).toBe('completed')
    // Should use dc: 15 from vars
    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const actionCheckEntry = emitCalls.find(
      (c) => (c[0] as { type: string }).type === 'daggerheart-core:action-check',
    )
    expect(actionCheckEntry).toBeDefined()
    const payload = (actionCheckEntry![0] as { payload: Record<string, unknown> }).payload
    expect(payload.dc).toBe(15)
  })

  it('defaults dc to 12 when no dc provided', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:action-check')

    // skipModifier but no dc → should default to 12
    const result = await runner.runWorkflow(handle, {
      formula: '2d12',
      actorId: 'actor-1',
      skipModifier: true,
    })

    expect(result.status).toBe('completed')
    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const actionCheckEntry = emitCalls.find(
      (c) => (c[0] as { type: string }).type === 'daggerheart-core:action-check',
    )
    expect(actionCheckEntry).toBeDefined()
    const payload = (actionCheckEntry![0] as { payload: Record<string, unknown> }).payload
    expect(payload.dc).toBe(12)
  })
})
