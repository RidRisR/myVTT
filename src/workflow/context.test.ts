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
  }
}

function makeRollEntry(overrides: Record<string, unknown> = {}) {
  return {
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
    payload: { rolls: [[4]], formula: '1d6', dice: [{ sides: 6, count: 1 }] },
    ...overrides,
  }
}

function makeDeps(overrides: Partial<Parameters<typeof createWorkflowContext>[0]> = {}) {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue(makeRollEntry()),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    eventBus: createEventBus(),
    engine: makeEngine(),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
    getSeatId: vi.fn().mockReturnValue('s1'),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
    ...overrides,
  }
}

describe('createWorkflowContext', () => {
  it('creates context with the provided initial state', () => {
    const ctx = createWorkflowContext(makeDeps(), { foo: 'bar' }, makeInternal())
    expect(ctx.vars).toEqual({ foo: 'bar' })
  })

  it('creates context with empty state when none provided', () => {
    const ctx = createWorkflowContext(makeDeps(), undefined, makeInternal())
    expect(ctx.vars).toEqual({})
  })

  it('all methods are functions', () => {
    const ctx = createWorkflowContext(makeDeps(), undefined, makeInternal())
    expect(typeof ctx.serverRoll).toBe('function')
    expect(typeof ctx.emitEntry).toBe('function')
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

  it('serverRoll delegates to deps.serverRoll with RollRequest', async () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal())
    const result = await ctx.serverRoll('1d6')
    expect(deps.serverRoll).toHaveBeenCalledWith(
      expect.objectContaining({
        formula: '1d6',
        origin: { seat: { id: 's1', name: 'GM', color: '#fff' } },
      }),
    )
    expect(result.payload.rolls).toEqual([[4]])
  })

  it('updateComponent emits core:component-update log entry', () => {
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

    expect(deps.emitEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'core:component-update',
        payload: { entityId: 'e1', key: 'hp', data: { current: 7, max: 20 } },
      }),
    )
  })

  it('updateTeamTracker emits core:tracker-update log entry', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal())
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing deprecated API
    ctx.updateTeamTracker('HP', { current: 5 })
    expect(deps.emitEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'core:tracker-update',
        payload: { label: 'HP', current: 5 },
      }),
    )
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

  it('ctx.vars is a getter — reassignment throws in strict mode', () => {
    const ctx = createWorkflowContext(makeDeps(), { foo: 'bar' }, makeInternal())
    expect(() => {
      // @ts-expect-error — testing runtime protection
      ctx.vars = {}
    }).toThrow()
    ctx.vars.foo = 'baz'
    expect(ctx.vars.foo).toBe('baz')
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
          capturedState = innerCtx.vars
        },
      },
    ])
    const ctx = createWorkflowContext(makeDeps({ engine }), undefined, makeInternal())
    await ctx.runWorkflow({ name: 'inner' } as never, { value: 42 })
    expect(capturedState).toEqual({ value: 42 })
  })

  it('readonly option: vars set throws TypeError', () => {
    const ctx = createWorkflowContext(makeDeps(), { foo: 'bar' }, makeInternal(), {
      readonly: true,
    })
    expect(() => {
      ctx.vars.foo = 'baz'
    }).toThrow(TypeError)
    // Value unchanged
    expect(ctx.vars.foo).toBe('bar')
  })

  it('readonly option: vars delete throws TypeError', () => {
    const ctx = createWorkflowContext(makeDeps(), { foo: 'bar' }, makeInternal(), {
      readonly: true,
    })
    expect(() => {
      delete ctx.vars.foo
    }).toThrow(TypeError)
    expect(ctx.vars.foo).toBe('bar')
  })

  it('readonly option: vars reads still work', () => {
    const ctx = createWorkflowContext(makeDeps(), { a: 1, b: 'hello' }, makeInternal(), {
      readonly: true,
    })
    expect(ctx.vars.a).toBe(1)
    expect(ctx.vars.b).toBe('hello')
    expect('a' in ctx.vars).toBe(true)
    expect(Object.keys(ctx.vars)).toEqual(['a', 'b'])
  })

  // ── groupId auto-injection tests ──────────────────────────────────────

  it('emitEntry auto-injects groupId from context options', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal(), { groupId: 'g-test' })
    ctx.emitEntry({ type: 'test:entry', payload: { x: 1 }, triggerable: false })

    expect(deps.emitEntry).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g-test' }))
  })

  it('serverRoll auto-injects groupId from context options', async () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal(), { groupId: 'g-roll' })
    await ctx.serverRoll('1d6')

    expect(deps.serverRoll).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g-roll' }))
  })

  it('updateComponent auto-injects groupId from context options', () => {
    const entity: Entity = {
      id: 'e1',
      tags: [],
      components: { hp: { current: 10, max: 20 } },
      permissions: { default: 'none' as const, seats: {} },
      lifecycle: 'persistent' as const,
    }
    const deps = makeDeps({ getEntity: vi.fn().mockReturnValue(entity) })
    const ctx = createWorkflowContext(deps, undefined, makeInternal(), { groupId: 'g-comp' })

    ctx.updateComponent<{ current: number; max: number }>('e1', 'hp', (c) => {
      const val = c ?? { current: 0, max: 0 }
      return { ...val, current: val.current - 1 }
    })

    expect(deps.emitEntry).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g-comp' }))
  })

  it('updateTeamTracker auto-injects groupId from context options', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal(), { groupId: 'g-tracker' })
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing deprecated API
    ctx.updateTeamTracker('HP', { current: 3 })

    expect(deps.emitEntry).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g-tracker' }))
  })

  it('default groupId is generated when not provided (uuid string)', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal())
    ctx.emitEntry({ type: 'test:entry', payload: {}, triggerable: false })

    expect(deps.emitEntry).toHaveBeenCalledTimes(1)
    const submission = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [
      Record<string, unknown>,
    ]
    expect(typeof submission[0].groupId).toBe('string')
    expect((submission[0].groupId as string).length).toBeGreaterThan(0)
  })

  it('nested runWorkflow inherits parent groupId', async () => {
    const engine = makeEngine()
    const deps = makeDeps({ engine })

    engine.defineWorkflow('inner', [
      {
        id: 'emit-inner',
        run: (innerCtx) => {
          innerCtx.emitEntry({ type: 'test:inner', payload: {}, triggerable: false })
        },
      },
    ])

    const ctx = createWorkflowContext(deps, undefined, makeInternal(), { groupId: 'g-parent' })
    await ctx.runWorkflow({ name: 'inner' } as never, {})

    // The inner workflow's emitEntry should use the same groupId as parent
    expect(deps.emitEntry).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g-parent' }))
  })

  it('causedBy is injected as parentId when provided', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal(), {
      groupId: 'g-caused',
      causedBy: 'entry-trigger-id',
    })
    ctx.emitEntry({ type: 'test:caused', payload: {}, triggerable: false })

    expect(deps.emitEntry).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'entry-trigger-id' }),
    )
  })

  it('causedBy is injected as parentId on serverRoll', async () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal(), {
      causedBy: 'roll-trigger-id',
    })
    await ctx.serverRoll('1d6')

    expect(deps.serverRoll).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'roll-trigger-id' }),
    )
  })

  it('explicit parentId in emitEntry overrides causedBy', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal(), {
      causedBy: 'trigger-id',
    })
    ctx.emitEntry({
      type: 'test:explicit',
      payload: {},
      triggerable: false,
      parentId: 'explicit-parent',
    })

    expect(deps.emitEntry).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'explicit-parent' }),
    )
  })

  it('chainDepth from context options is used as default in emitEntry', () => {
    const deps = makeDeps()
    const ctx = createWorkflowContext(deps, undefined, makeInternal(), { chainDepth: 3 })
    ctx.emitEntry({ type: 'test:depth', payload: {}, triggerable: false })

    expect(deps.emitEntry).toHaveBeenCalledWith(expect.objectContaining({ chainDepth: 3 }))
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
          ctx.vars.innerStatus = result.status
        },
      },
      {
        id: 'after',
        run: (ctx) => {
          ctx.vars.afterRan = true
        },
      },
    ])

    const internal = makeInternal()
    const ctx = createWorkflowContext(makeDeps({ engine }), {}, internal)
    const result = await engine.runWorkflow('outer', ctx, internal)
    // Inner aborted, but outer continued
    expect(result.status).toBe('completed')
    expect(ctx.vars.innerStatus).toBe('aborted')
    expect(ctx.vars.afterRan).toBe(true)
  })
})
