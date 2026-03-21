// src/workflow/context.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createWorkflowContext } from './context'
import { WorkflowEngine } from './engine'
import type { InternalState } from './types'

function makeEngine(): WorkflowEngine {
  return new WorkflowEngine()
}

function makeInternal(): InternalState {
  return {
    depth: 0,
    abortCtrl: { aborted: false },
    dataCtrl: { getInner: () => ({}), replaceInner: () => {} },
  }
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
    const ctx = createWorkflowContext(makeDeps(), { foo: 'bar' }, makeInternal())
    expect(ctx.data).toEqual({ foo: 'bar' })
  })

  it('creates context with empty data when none provided', () => {
    const ctx = createWorkflowContext(makeDeps(), undefined, makeInternal())
    expect(ctx.data).toEqual({})
  })

  it('all methods are functions', () => {
    const ctx = createWorkflowContext(makeDeps(), undefined, makeInternal())
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
    const ctx = createWorkflowContext(deps, undefined, makeInternal())
    const result = await ctx.serverRoll('1d6')
    expect(deps.sendRoll).toHaveBeenCalledWith('1d6')
    expect(result).toEqual({ rolls: [[4]], total: 4 })
  })

  it('updateEntity delegates to deps.updateEntity', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal())
    ctx.updateEntity('entity-1', { name: 'Goblin' })
    expect(deps.updateEntity).toHaveBeenCalledWith('entity-1', { name: 'Goblin' })
  })

  it('updateTeamTracker delegates to deps.updateTeamTracker', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal())
    ctx.updateTeamTracker('HP', { current: 5 })
    expect(deps.updateTeamTracker).toHaveBeenCalledWith('HP', { current: 5 })
  })

  it('announce delegates to deps.sendMessage', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal())
    ctx.announce('Hello world')
    expect(deps.sendMessage).toHaveBeenCalledWith('Hello world')
  })

  it('showToast delegates to deps.showToast', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal())
    ctx.showToast('Success!', { variant: 'success' })
    expect(deps.showToast).toHaveBeenCalledWith('Success!', { variant: 'success' })
  })

  it('playAnimation is a no-op stub that resolves', async () => {
    const ctx = createWorkflowContext(makeDeps(), undefined, makeInternal())
    await expect(ctx.playAnimation({ type: 'flash' })).resolves.toBeUndefined()
  })

  it('playSound is a no-op stub', () => {
    const ctx = createWorkflowContext(makeDeps(), undefined, makeInternal())
    expect(() => {
      ctx.playSound('boom.mp3')
    }).not.toThrow()
  })

  it('abort sets internal state', () => {
    const internal = makeInternal()
    const ctx = createWorkflowContext(makeDeps(), undefined, internal)
    ctx.abort('reason')
    expect(internal.abortCtrl.aborted).toBe(true)
    expect(internal.abortCtrl.reason).toBe('reason')
  })

  it('ctx.data is a getter — reassignment throws in strict mode', () => {
    const ctx = createWorkflowContext(makeDeps(), { foo: 'bar' }, makeInternal())
    expect(() => {
      // @ts-expect-error — testing runtime protection
      ctx.data = {}
    }).toThrow()
    ctx.data.foo = 'baz'
    expect(ctx.data.foo).toBe('baz')
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
    const ctx = createWorkflowContext(makeDeps({ engine }), undefined, makeInternal())
    await ctx.runWorkflow({ name: 'inner' } as never, { x: 1 })
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
    const ctx = createWorkflowContext(makeDeps({ engine }), undefined, makeInternal())
    await ctx.runWorkflow({ name: 'inner' } as never, { value: 42 })
    expect(capturedData).toEqual({ value: 42 })
  })

  it('nested workflow has independent abort', async () => {
    const engine = makeEngine()
    engine.defineWorkflow('inner', [
      {
        id: 'abort-inner',
        run: (ctx) => {
          ctx.abort('inner-stop')
        },
      },
    ])
    engine.defineWorkflow('outer', [
      {
        id: 'call-inner',
        run: async (ctx) => {
          const result = await ctx.runWorkflow({ name: 'inner' } as never)
          ctx.data.innerStatus = result.status
        },
      },
      {
        id: 'after',
        run: (ctx) => {
          ctx.data.afterRan = true
        },
      },
    ])

    const internal = makeInternal()
    const ctx = createWorkflowContext(makeDeps({ engine }), {}, internal)
    const result = await engine.runWorkflow('outer', ctx, internal)
    // Inner aborted, but outer continued
    expect(result.status).toBe('completed')
    expect(ctx.data.innerStatus).toBe('aborted')
    expect(ctx.data.afterRan).toBe(true)
  })
})
