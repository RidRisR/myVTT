import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from './engine'
import { registerBaseWorkflows, getRollWorkflow, getQuickRollWorkflow } from './baseWorkflows'
import { createWorkflowContext } from './context'
import { createEventBus } from '../events/eventBus'
import { announceEvent } from '../events/systemEvents'
import type { InternalState } from './types'

function makeInternal(): InternalState {
  return {
    depth: 0,
    abortCtrl: { aborted: false },
  }
}

describe('base roll workflow', () => {
  it('defines "roll" with generate step only (no display)', () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    expect(engine.inspectWorkflow('roll')).toEqual(['generate'])
  })

  it('getRollWorkflow() handle has name "roll"', () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    expect(getRollWorkflow().name).toBe('roll')
  })

  it('roll workflow returns structured output { rolls, total }', async () => {
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
    const result = await engine.runWorkflow('roll', ctx, internal)
    expect(result.status).toBe('completed')
    if (result.status === 'completed') {
      expect(result.output).toEqual({ rolls: [[8, 5]], total: 13 })
    }
  })

  it('quick-roll composes roll + display', async () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    expect(engine.inspectWorkflow('quick-roll')).toEqual(['roll', 'display'])
    expect(getQuickRollWorkflow().name).toBe('quick-roll')

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
    await engine.runWorkflow('quick-roll', ctx, internal)
    expect(announcements).toEqual([
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher returns any
      expect.objectContaining({ message: expect.stringContaining('2d12+1') }),
    ])
  })
})
