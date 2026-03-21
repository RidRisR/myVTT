// src/workflow/context.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createWorkflowContext } from './context'
import { WorkflowEngine } from './engine'

function makeEngine(): WorkflowEngine {
  return new WorkflowEngine()
}

function makeDeps(overrides: Partial<Parameters<typeof createWorkflowContext>[0]> = {}) {
  return {
    sendRoll: vi.fn().mockResolvedValue({ rolls: [[4]], total: 4 }),
    updateEntity: vi.fn(),
    updateTeamTracker: vi.fn(),
    sendMessage: vi.fn(),
    showToast: vi.fn(),
    engine: makeEngine(),
    ...overrides,
  }
}

describe('createWorkflowContext', () => {
  it('creates context with the provided initial data', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, { foo: 'bar' })
    expect(ctx.data).toEqual({ foo: 'bar' })
  })

  it('creates context with empty data when none provided', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps)
    expect(ctx.data).toEqual({})
  })

  it('all methods are functions', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps)
    expect(typeof ctx.serverRoll).toBe('function')
    expect(typeof ctx.updateEntity).toBe('function')
    expect(typeof ctx.updateTeamTracker).toBe('function')
    expect(typeof ctx.announce).toBe('function')
    expect(typeof ctx.showToast).toBe('function')
    expect(typeof ctx.playAnimation).toBe('function')
    expect(typeof ctx.playSound).toBe('function')
    expect(typeof ctx.abort).toBe('function')
    expect(typeof ctx.runWorkflow).toBe('function')
  })

  it('serverRoll delegates to deps.sendRoll', async () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps)
    const result = await ctx.serverRoll('1d6')
    expect(deps.sendRoll).toHaveBeenCalledWith('1d6')
    expect(result).toEqual({ rolls: [[4]], total: 4 })
  })

  it('updateEntity delegates to deps.updateEntity', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps)
    ctx.updateEntity('entity-1', { name: 'Goblin' })
    expect(deps.updateEntity).toHaveBeenCalledWith('entity-1', { name: 'Goblin' })
  })

  it('updateTeamTracker delegates to deps.updateTeamTracker', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps)
    ctx.updateTeamTracker('HP', { current: 5 })
    expect(deps.updateTeamTracker).toHaveBeenCalledWith('HP', { current: 5 })
  })

  it('announce delegates to deps.sendMessage', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps)
    ctx.announce('Hello world')
    expect(deps.sendMessage).toHaveBeenCalledWith('Hello world')
  })

  it('showToast delegates to deps.showToast', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps)
    ctx.showToast('Success!', { variant: 'success' })
    expect(deps.showToast).toHaveBeenCalledWith('Success!', { variant: 'success' })
  })

  it('playAnimation is a no-op stub that resolves', async () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps)
    await expect(ctx.playAnimation({ type: 'flash' })).resolves.toBeUndefined()
  })

  it('playSound is a no-op stub', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps)
    expect(() => {
      ctx.playSound('boom.mp3')
    }).not.toThrow()
  })

  it('abort is a no-op stub (engine intercepts)', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps)
    expect(() => {
      ctx.abort('reason')
    }).not.toThrow()
  })

  it('runWorkflow creates a nested context and delegates to engine', async () => {
    const engine = makeEngine()
    const order: string[] = []
    engine.defineWorkflow('inner', [
      {
        id: 'step',
        run: () => {
          order.push('inner-ran')
        },
      },
    ])
    const deps = makeDeps({ engine })
    const ctx = createWorkflowContext(deps)
    await ctx.runWorkflow('inner', { x: 1 })
    expect(order).toEqual(['inner-ran'])
  })

  it('runWorkflow passes initial data to nested context', async () => {
    const engine = makeEngine()
    let capturedData: Record<string, unknown> = {}
    engine.defineWorkflow('inner', [
      {
        id: 'capture',
        run: (innerCtx) => {
          capturedData = innerCtx.data
        },
      },
    ])
    const deps = makeDeps({ engine })
    const ctx = createWorkflowContext(deps)
    await ctx.runWorkflow('inner', { value: 42 })
    expect(capturedData).toEqual({ value: 42 })
  })
})
