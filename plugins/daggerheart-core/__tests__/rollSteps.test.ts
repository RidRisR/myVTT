// plugins/daggerheart-core/__tests__/rollSteps.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK, WorkflowRunner } from '../../../src/workflow/pluginSDK'
import { registerBaseWorkflows } from '../../../src/workflow/baseWorkflows'
import { registerDHCoreSteps, getDHActionCheckWorkflow } from '../rollSteps'
import type { ContextDeps } from '../../../src/workflow/context'

function makeRollEntry(rolls: number[][] = [[4, 9]]) {
  return {
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
    payload: { rolls, formula: '2d12', dice: [{ sides: 12, count: 2 }] },
  }
}

function makeDeps(overrides: Partial<ContextDeps> = {}): Omit<ContextDeps, 'engine'> {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue(makeRollEntry()),
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
  registerDHCoreSteps(sdk)
  return { engine, deps, sdk, runner }
}

describe('registerDHCoreSteps', () => {
  it('defines dh:action-check with roll, judgment, display steps', () => {
    const { sdk } = makeSetup()
    const steps = sdk.inspectWorkflow(getDHActionCheckWorkflow())
    expect(steps).toEqual(['roll', 'judgment'])
  })

  it('dh:action-check calls ctx.serverRoll directly (no nested roll workflow)', async () => {
    const { runner, deps } = makeSetup()
    await runner.runWorkflow(getDHActionCheckWorkflow(), { formula: '2d12', actorId: '' })
    expect(deps.serverRoll).toHaveBeenCalledWith(expect.objectContaining({ formula: '2d12' }))
  })

  it('no dh:judgment entry emitted — judgment renders via RollResultRenderer config', async () => {
    const { runner, deps } = makeSetup({
      serverRoll: vi.fn().mockResolvedValue(makeRollEntry([[4, 9]])),
    })
    await runner.runWorkflow(getDHActionCheckWorkflow(), { formula: '2d12', actorId: '' })
    // Should NOT emit dh:judgment — only core:roll-result (from base roll) + core:tracker-update
    const calls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const emittedTypes = calls.map((c) => (c[0] as { type: string }).type)
    expect(emittedTypes).not.toContain('dh:judgment')
  })

  it('dh:resolve emits tracker-update for Fear on success_fear outcome (rolls [[4,9]])', async () => {
    const { runner, deps } = makeSetup({
      serverRoll: vi.fn().mockResolvedValue(makeRollEntry([[4, 9]])),
    })
    await runner.runWorkflow(getDHActionCheckWorkflow(), { formula: '2d12', actorId: '' })
    expect(deps.emitEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'core:tracker-update',
        payload: { label: 'Fear', current: 1 },
      }),
    )
  })

  it('dh:resolve emits tracker-update for Hope on success_hope outcome (rolls [[9,4]])', async () => {
    const { runner, deps } = makeSetup({
      serverRoll: vi.fn().mockResolvedValue(makeRollEntry([[9, 4]])),
    })
    await runner.runWorkflow(getDHActionCheckWorkflow(), { formula: '2d12', actorId: '' })
    expect(deps.emitEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'core:tracker-update',
        payload: { label: 'Hope', current: 1 },
      }),
    )
  })
})
