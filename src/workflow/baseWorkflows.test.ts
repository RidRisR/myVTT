import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from './engine'
import { registerBaseWorkflows, getRollWorkflow } from './baseWorkflows'
import { createWorkflowContext } from './context'
import { createEventBus } from '../events/eventBus'
import { announceEvent } from '../events/systemEvents'
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

  it('generate step calls serverRoll and stores result in ctx.state', async () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    const deps = {
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[8, 5]], total: 13 }),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      getEntity: vi.fn(),
      getAllEntities: vi.fn().mockReturnValue({}),
      eventBus: createEventBus(),
      engine,
    }
    const internal = makeInternal()
    const ctx = createWorkflowContext(deps, { formula: '2d12+1' }, internal)
    await engine.runWorkflow('roll', ctx, internal)
    expect(deps.sendRoll).toHaveBeenCalledWith('2d12+1')
    expect(ctx.state.rolls).toEqual([[8, 5]])
    expect(ctx.state.total).toBe(13)
  })

  it('display step emits announce event with formula and total', async () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    const bus = createEventBus()
    const announcements: unknown[] = []
    bus.on(announceEvent, (p) => announcements.push(p))

    const deps = {
      sendRoll: vi.fn().mockResolvedValue({ rolls: [[8, 5]], total: 13 }),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      getEntity: vi.fn(),
      getAllEntities: vi.fn().mockReturnValue({}),
      eventBus: bus,
      engine,
    }
    const internal = makeInternal()
    const ctx = createWorkflowContext(deps, { formula: '2d12+1' }, internal)
    await engine.runWorkflow('roll', ctx, internal)
    expect(announcements).toEqual([
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher returns any
      expect.objectContaining({ message: expect.stringContaining('2d12+1') }),
    ])
  })
})
