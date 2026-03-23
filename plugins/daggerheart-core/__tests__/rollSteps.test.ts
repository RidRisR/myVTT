// plugins/daggerheart-core/__tests__/rollSteps.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK, WorkflowRunner } from '../../../src/workflow/pluginSDK'
import { registerBaseWorkflows, getRollWorkflow } from '../../../src/workflow/baseWorkflows'
import { registerDHCoreSteps } from '../rollSteps'
import type { ContextDeps } from '../../../src/workflow/context'
import { EventBus } from '../../../src/events/eventBus'

function makeDeps(overrides: Partial<ContextDeps> = {}): Omit<ContextDeps, 'engine'> {
  return {
    sendRoll: vi.fn().mockResolvedValue({ rolls: [[4, 9]], total: 15 }),
    updateEntity: vi.fn(),
    updateTeamTracker: vi.fn(),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    eventBus: new EventBus(),
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
  it('adds dh:judge after generate in the roll workflow', () => {
    const { sdk } = makeSetup()
    const steps = sdk.inspectWorkflow(getRollWorkflow())
    const generateIdx = steps.indexOf('generate')
    const judgeIdx = steps.indexOf('dh:judge')
    expect(judgeIdx).toBeGreaterThan(-1)
    expect(judgeIdx).toBeGreaterThan(generateIdx)
  })

  it('adds dh:resolve before display in the roll workflow', () => {
    const { sdk } = makeSetup()
    const steps = sdk.inspectWorkflow(getRollWorkflow())
    const resolveIdx = steps.indexOf('dh:resolve')
    const displayIdx = steps.indexOf('display')
    expect(resolveIdx).toBeGreaterThan(-1)
    expect(resolveIdx).toBeLessThan(displayIdx)
  })

  it('dh:judge computes judgment from rolls returned by serverRoll', async () => {
    const { runner, deps } = makeSetup()
    await runner.runWorkflow(getRollWorkflow(), { formula: '2d12', actorId: '' })
    expect(deps.sendRoll).toHaveBeenCalledWith('2d12')
  })

  it('dh:resolve calls updateTeamTracker with Fear on success_fear outcome (rolls [[4,9]])', async () => {
    const { runner, deps } = makeSetup({
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[4, 9]], total: 15 }),
    })
    await runner.runWorkflow(getRollWorkflow(), { formula: '2d12', actorId: '' })
    expect(deps.updateTeamTracker).toHaveBeenCalledWith('Fear', { current: 1 })
  })

  it('dh:resolve calls updateTeamTracker with Hope on success_hope outcome (rolls [[9,4]])', async () => {
    const { runner, deps } = makeSetup({
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[9, 4]], total: 15 }),
    })
    await runner.runWorkflow(getRollWorkflow(), { formula: '2d12', actorId: '' })
    expect(deps.updateTeamTracker).toHaveBeenCalledWith('Hope', { current: 1 })
  })
})
