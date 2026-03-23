// src/workflow/context.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createWorkflowContext } from './context'
import { WorkflowEngine } from './engine'
import { createEventBus, defineEvent } from '../events/eventBus'
import type { InternalState } from './types'
import type { Entity } from '../shared/entityTypes'

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
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    eventBus: createEventBus(),
    engine: makeEngine(),
    ...overrides,
  }
}

describe('createWorkflowContext', () => {
  it('creates context with the provided initial state', () => {
    const ctx = createWorkflowContext(makeDeps(), { foo: 'bar' }, makeInternal())
    expect(ctx.state).toEqual({ foo: 'bar' })
  })

  it('creates context with empty state when none provided', () => {
    const ctx = createWorkflowContext(makeDeps(), undefined, makeInternal())
    expect(ctx.state).toEqual({})
  })

  it('all methods are functions', () => {
    const ctx = createWorkflowContext(makeDeps(), undefined, makeInternal())
    expect(typeof ctx.serverRoll).toBe('function')
    expect(typeof ctx.updateComponent).toBe('function')
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing deprecated API
    expect(typeof ctx.updateTeamTracker).toBe('function')
    expect(typeof ctx.events.emit).toBe('function')
    expect(typeof ctx.abort).toBe('function')
    expect(typeof ctx.runWorkflow).toBe('function')
  })

  it('provides read.entity and read.component', () => {
    const ctx = createWorkflowContext(makeDeps(), undefined, makeInternal())
    expect(typeof ctx.read.entity).toBe('function')
    expect(typeof ctx.read.component).toBe('function')
    expect(typeof ctx.read.query).toBe('function')
  })

  it('serverRoll delegates to deps.sendRoll', async () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal())
    const result = await ctx.serverRoll('1d6')
    expect(deps.sendRoll).toHaveBeenCalledWith('1d6')
    expect(result).toEqual({ rolls: [[4]], total: 4 })
  })

  it('updateComponent reads entity components and writes back', () => {
    const entity: Entity = {
      id: 'e1',
      tags: [],
      components: { hp: { current: 10, max: 20 } },
      permissions: { default: 'none' as const, seats: {} },
      lifecycle: 'persistent' as const,
    }
    const deps = makeDeps({ getEntity: vi.fn().mockReturnValue(entity) })
    const ctx = createWorkflowContext(deps, undefined, makeInternal())

    ctx.updateComponent<{ current: number; max: number }>('e1', 'hp', (c) => {
      const val = c ?? { current: 0, max: 0 }
      return { ...val, current: val.current - 3 }
    })

    expect(deps.updateEntity).toHaveBeenCalledWith('e1', {
      components: { hp: { current: 7, max: 20 } },
    })
  })

  it('updateTeamTracker delegates to deps.updateTeamTracker', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal())
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing deprecated API
    ctx.updateTeamTracker('HP', { current: 5 })
    expect(deps.updateTeamTracker).toHaveBeenCalledWith('HP', { current: 5 })
  })

  it('events.emit delegates to deps.eventBus', () => {
    const bus = createEventBus()
    const deps = makeDeps({ eventBus: bus })
    const ctx = createWorkflowContext(deps, undefined, makeInternal())

    const handle = defineEvent<string>('test:event')
    const received: string[] = []
    bus.on(handle, (p) => received.push(p))

    ctx.events.emit(handle, 'hello')
    expect(received).toEqual(['hello'])
  })

  it('abort sets internal state', () => {
    const internal = makeInternal()
    const ctx = createWorkflowContext(makeDeps(), undefined, internal)
    ctx.abort('reason')
    expect(internal.abortCtrl.aborted).toBe(true)
    expect(internal.abortCtrl.reason).toBe('reason')
  })

  it('ctx.state is a getter — reassignment throws in strict mode', () => {
    const ctx = createWorkflowContext(makeDeps(), { foo: 'bar' }, makeInternal())
    expect(() => {
      // @ts-expect-error — testing runtime protection
      ctx.state = {}
    }).toThrow()
    ctx.state.foo = 'baz'
    expect(ctx.state.foo).toBe('baz')
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
    let capturedState: Record<string, unknown> = {}
    engine.defineWorkflow('inner', [
      {
        id: 'capture',
        run: (innerCtx) => {
          capturedState = innerCtx.state
        },
      },
    ])
    const ctx = createWorkflowContext(makeDeps({ engine }), undefined, makeInternal())
    await ctx.runWorkflow({ name: 'inner' } as never, { value: 42 })
    expect(capturedState).toEqual({ value: 42 })
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
          ctx.state.innerStatus = result.status
        },
      },
      {
        id: 'after',
        run: (ctx) => {
          ctx.state.afterRan = true
        },
      },
    ])

    const internal = makeInternal()
    const ctx = createWorkflowContext(makeDeps({ engine }), {}, internal)
    const result = await engine.runWorkflow('outer', ctx, internal)
    // Inner aborted, but outer continued
    expect(result.status).toBe('completed')
    expect(ctx.state.innerStatus).toBe('aborted')
    expect(ctx.state.afterRan).toBe(true)
  })
})
