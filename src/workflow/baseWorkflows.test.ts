import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from './engine'
import { registerBaseWorkflows, getQuickRollWorkflow, getRollWorkflow } from './baseWorkflows'
import type { RollOutput } from './baseWorkflows'
import { createWorkflowContext } from './context'
import type { InternalState } from './types'

function makeInternal(): InternalState {
  return {
    depth: 0,
    abortCtrl: { aborted: false },
  }
}

function makeMockDeps(engine: WorkflowEngine) {
  return {
    deps: {
      emitEntry: vi.fn(),
      serverRoll: vi.fn().mockResolvedValue([[8, 5]]),
      createEntity: vi.fn().mockResolvedValue('test:entity-1'),
      deleteEntity: vi.fn().mockResolvedValue(undefined),
      getEntity: vi.fn(),
      getAllEntities: vi.fn().mockReturnValue({}),
      engine,
      getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
      getSeatId: vi.fn().mockReturnValue('s1'),
      getLogWatermark: vi.fn().mockReturnValue(0),
      getFormulaTokens: vi.fn().mockReturnValue({}),
    },
  }
}

describe('base workflows', () => {
  describe('roll workflow', () => {
    it('has a single generate step', () => {
      const engine = new WorkflowEngine()
      registerBaseWorkflows(engine)
      expect(engine.inspectWorkflow('roll')).toEqual(['generate'])
      expect(getRollWorkflow().name).toBe('roll')
    })

    it('computes total from formula + rolls and returns RollOutput', async () => {
      const engine = new WorkflowEngine()
      registerBaseWorkflows(engine)

      const { deps } = makeMockDeps(engine)
      const internal = makeInternal()
      const ctx = createWorkflowContext(deps, { formula: '2d12+1', actorId: 'a1' }, internal)
      const result = await engine.runWorkflow('roll', ctx, internal)

      expect(result.status).toBe('completed')
      if (result.status === 'completed') {
        const output = result.output as RollOutput
        expect(output.rolls).toEqual([[8, 5]])
        // 2d12+1 with rolls [8, 5] => 8 + 5 + 1 = 14
        expect(output.total).toBe(14)
      }
    })

    it('aborts on missing formula', async () => {
      const engine = new WorkflowEngine()
      registerBaseWorkflows(engine)

      const { deps } = makeMockDeps(engine)
      const internal = makeInternal()
      const ctx = createWorkflowContext(deps, { formula: '', actorId: 'a1' }, internal)
      const result = await engine.runWorkflow('roll', ctx, internal)

      expect(result.status).toBe('aborted')
    })

    it('resolves @tokens in formula', async () => {
      const engine = new WorkflowEngine()
      registerBaseWorkflows(engine)

      const { deps } = makeMockDeps(engine)
      const fakeEntity = { id: 'a1', components: {} }
      deps.getEntity.mockReturnValue(fakeEntity)
      deps.getFormulaTokens.mockReturnValue({ str: 3 })
      // 1d20+3 needs only 1 roll for the d20
      deps.serverRoll.mockResolvedValue([[15]])
      const internal = makeInternal()
      const ctx = createWorkflowContext(deps, { formula: '1d20+@str', actorId: 'a1' }, internal)
      const result = await engine.runWorkflow('roll', ctx, internal)

      expect(deps.serverRoll).toHaveBeenCalled()
      // serverRoll now receives { dice: [...] } — verify dice was passed
      const callArgs = deps.serverRoll.mock.calls[0] as unknown[]
      const request = callArgs[0] as { dice: unknown[] }
      expect(request.dice).toEqual([{ sides: 20, count: 1 }])
      // 1d20+3 with roll [15] => 15 + 3 = 18
      expect(result.status).toBe('completed')
      if (result.status === 'completed') {
        const output = result.output as RollOutput
        expect(output.total).toBe(18)
      }
    })
  })

  describe('quick-roll workflow', () => {
    it('has roll + emit steps', () => {
      const engine = new WorkflowEngine()
      registerBaseWorkflows(engine)
      expect(engine.inspectWorkflow('quick-roll')).toEqual(['roll', 'emit'])
      expect(getQuickRollWorkflow().name).toBe('quick-roll')
    })

    it('delegates to roll workflow and computes total', async () => {
      const engine = new WorkflowEngine()
      registerBaseWorkflows(engine)

      const { deps } = makeMockDeps(engine)

      const internal = makeInternal()
      const ctx = createWorkflowContext(deps, { formula: '2d12+1', actorId: 'a1' }, internal)
      const result = await engine.runWorkflow('quick-roll', ctx, internal)
      expect(result.status).toBe('completed')
      expect(ctx.vars.total).toBe(14) // 8 + 5 + 1
    })
  })
})
