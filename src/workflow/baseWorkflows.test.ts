import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from './engine'
import { registerBaseWorkflows, getRollWorkflow } from './baseWorkflows'
import { createWorkflowContext } from './context'
import type { InternalState } from './types'

function makeInternal(): InternalState {
  return {
    depth: 0,
    abortCtrl: { aborted: false },
    dataCtrl: { getInner: () => ({}), replaceInner: () => {} },
  }
}

describe('base roll workflow', () => {
  it('defines "roll" with generate + display steps', () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    expect(engine.inspectWorkflow('roll')).toEqual(['generate', 'display'])
  })

  it('getRollWorkflow() handle has name "roll"', () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    expect(getRollWorkflow().name).toBe('roll')
  })

  it('generate step calls serverRoll and stores result in ctx.data', async () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    const deps = {
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[8, 5]], total: 13 }),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      sendMessage: vi.fn(),
      showToast: vi.fn(),
      engine,
    }
    const internal = makeInternal()
    const ctx = createWorkflowContext(deps, { formula: '2d12+1' }, internal)
    await engine.runWorkflow('roll', ctx, internal)
    expect(deps.sendRoll).toHaveBeenCalledWith('2d12+1')
    expect(ctx.data.rolls).toEqual([[8, 5]])
    expect(ctx.data.total).toBe(13)
  })

  it('display step calls announce with formula and total', async () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    const deps = {
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[8, 5]], total: 13 }),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      sendMessage: vi.fn(),
      showToast: vi.fn(),
      engine,
    }
    const internal = makeInternal()
    const ctx = createWorkflowContext(deps, { formula: '2d12+1' }, internal)
    await engine.runWorkflow('roll', ctx, internal)
    expect(deps.sendMessage).toHaveBeenCalledWith(expect.stringContaining('2d12+1'))
    expect(deps.sendMessage).toHaveBeenCalledWith(expect.stringContaining('13'))
  })
})
