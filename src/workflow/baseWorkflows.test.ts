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
        payload: { rolls: [[8, 5]], total: 13, formula: '2d12+1', dice: [{ sides: 12, count: 2 }] },
      }),
      getEntity: vi.fn(),
      getAllEntities: vi.fn().mockReturnValue({}),
      eventBus: createEventBus(),
      engine,
      getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
      getSeatId: vi.fn().mockReturnValue('s1'),
      getLogWatermark: vi.fn().mockReturnValue(0),
      getFormulaTokens: vi.fn().mockReturnValue({}),
    }
    const internal = makeInternal()
    const ctx = createWorkflowContext(deps, { formula: '2d12+1', actorId: 'a1' }, internal)
    const result = await engine.runWorkflow('roll', ctx, internal)
    expect(result.status).toBe('completed')
    if (result.status === 'completed') {
      // total includes modifier: 8 + 5 + 1 = 14
      expect(result.output).toEqual({ rolls: [[8, 5]], total: 14 })
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
        payload: { rolls: [[8, 5]], total: 13, formula: '2d12+1', dice: [{ sides: 12, count: 2 }] },
      }),
      getEntity: vi.fn(),
      getAllEntities: vi.fn().mockReturnValue({}),
      eventBus: bus,
      engine,
      getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
      getSeatId: vi.fn().mockReturnValue('s1'),
      getLogWatermark: vi.fn().mockReturnValue(0),
      getFormulaTokens: vi.fn().mockReturnValue({}),
    }
    const internal = makeInternal()
    const ctx = createWorkflowContext(deps, { formula: '2d12+1', actorId: 'a1' }, internal)
    await engine.runWorkflow('quick-roll', ctx, internal)
    expect(announcements).toEqual([
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher returns any
      expect.objectContaining({ message: expect.stringContaining('2d12+1') }),
    ])
  })
})
