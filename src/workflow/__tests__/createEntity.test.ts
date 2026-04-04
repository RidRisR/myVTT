import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../engine'
import { createWorkflowContext } from '../context'
import type { ContextDeps } from '../context'

function makeDeps(overrides: Partial<ContextDeps> = {}): ContextDeps {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue([]),
    createEntity: vi.fn().mockResolvedValue('test:entity-1'),
    deleteEntity: vi.fn().mockResolvedValue(undefined),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    engine: new WorkflowEngine(),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
    getSeatId: vi.fn().mockReturnValue('s1'),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
    ...overrides,
  }
}

describe('WorkflowContext.createEntity', () => {
  it('delegates to deps.createEntity and returns entity ID', async () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, {}, { depth: 0, abortCtrl: { aborted: false } })
    const id = await ctx.createEntity({
      id: 'test:my-entity',
      components: { 'test:data': { value: 42 } },
    })
    expect(id).toBe('test:entity-1')
    expect(deps.createEntity).toHaveBeenCalledWith({
      id: 'test:my-entity',
      components: { 'test:data': { value: 42 } },
    })
  })
})

describe('WorkflowContext.deleteEntity', () => {
  it('delegates to deps.deleteEntity', async () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, {}, { depth: 0, abortCtrl: { aborted: false } })
    await ctx.deleteEntity('test:my-entity')
    expect(deps.deleteEntity).toHaveBeenCalledWith('test:my-entity')
  })
})
