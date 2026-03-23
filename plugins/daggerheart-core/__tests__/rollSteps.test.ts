// plugins/daggerheart-core/__tests__/rollSteps.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK, WorkflowRunner } from '../../../src/workflow/pluginSDK'
import { registerBaseWorkflows } from '../../../src/workflow/baseWorkflows'
import { registerDHCoreSteps, getDHActionCheckWorkflow } from '../rollSteps'
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
  it('defines dh:action-check with roll, dh:judge, dh:resolve, display steps', () => {
    const { sdk } = makeSetup()
    const steps = sdk.inspectWorkflow(getDHActionCheckWorkflow())
    expect(steps).toEqual(['roll', 'dh:judge', 'dh:resolve', 'display'])
  })

  it('base roll workflow remains pure (no dh steps injected)', () => {
    const { engine } = makeSetup()
    expect(engine.inspectWorkflow('roll')).toEqual(['generate'])
  })

  it('dh:action-check internally calls roll workflow and gets output', async () => {
    const { runner, deps } = makeSetup()
    await runner.runWorkflow(getDHActionCheckWorkflow(), { formula: '2d12', actorId: '' })
    expect(deps.sendRoll).toHaveBeenCalledWith('2d12')
  })

  it('dh:resolve calls updateTeamTracker with Fear on success_fear outcome (rolls [[4,9]])', async () => {
    const { runner, deps } = makeSetup({
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[4, 9]], total: 15 }),
    })
    await runner.runWorkflow(getDHActionCheckWorkflow(), { formula: '2d12', actorId: '' })
    expect(deps.updateTeamTracker).toHaveBeenCalledWith('Fear', { current: 1 })
  })

  it('dh:resolve calls updateTeamTracker with Hope on success_hope outcome (rolls [[9,4]])', async () => {
    const { runner, deps } = makeSetup({
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[9, 4]], total: 15 }),
    })
    await runner.runWorkflow(getDHActionCheckWorkflow(), { formula: '2d12', actorId: '' })
    expect(deps.updateTeamTracker).toHaveBeenCalledWith('Hope', { current: 1 })
  })
})
