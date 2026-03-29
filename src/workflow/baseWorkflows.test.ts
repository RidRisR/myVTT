import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from './engine'
import { registerBaseWorkflows, getQuickRollWorkflow } from './baseWorkflows'
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

describe('base workflows', () => {
  it('quick-roll has roll + display steps (no separate roll workflow)', () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    expect(engine.inspectWorkflow('quick-roll')).toEqual(['roll', 'display'])
    expect(getQuickRollWorkflow().name).toBe('quick-roll')
  })

  it('quick-roll inlines roll logic and displays result', async () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)

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
