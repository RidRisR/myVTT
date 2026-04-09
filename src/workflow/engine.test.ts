// src/workflow/engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowEngine } from './engine'
import type { WorkflowContext, InternalState } from './types'

function makeCtx(data: Record<string, unknown> = {}): WorkflowContext {
  return {
    vars: data,
    read: {
      entity: vi.fn(),
      component: vi.fn(),
      query: vi.fn().mockReturnValue([]),
      formulaTokens: vi.fn().mockReturnValue({}),
    },
    serverRoll: vi.fn(),
    requestInput: vi.fn(),
    emitEntry: vi.fn(),
    updateComponent: vi.fn(),
    createEntity: vi.fn().mockResolvedValue('test:entity-1'),
    deleteEntity: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    runWorkflow: vi.fn(),
  }
}

function makeInternal(): InternalState {
  return {
    depth: 0,
    abortCtrl: { aborted: false },
  }
}

/** Helper: run workflow with default InternalState */
function run(engine: WorkflowEngine, name: string, ctx?: WorkflowContext) {
  return engine.runWorkflow(name, ctx ?? makeCtx(), makeInternal())
}

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine

  beforeEach(() => {
    engine = new WorkflowEngine()
  })

  // ── 1. Steps execute in order ──────────────────────────────────────────────
  it('executes steps in definition order', async () => {
    const order: string[] = []
    engine.defineWorkflow('test', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
      {
        id: 'b',
        run: () => {
          order.push('b')
        },
      },
      {
        id: 'c',
        run: () => {
          order.push('c')
        },
      },
    ])
    await run(engine, 'test')
    expect(order).toEqual(['a', 'b', 'c'])
  })

  // ── 2. Duplicate workflow name throws ──────────────────────────────────────
  it('throws on duplicate workflow name', () => {
    engine.defineWorkflow('dup', [])
    expect(() => {
      engine.defineWorkflow('dup', [])
    }).toThrow(/already defined/i)
  })

  // ── 3. Unknown workflow throws ─────────────────────────────────────────────
  it('throws on unknown workflow in runWorkflow', async () => {
    await expect(run(engine, 'nonexistent')).rejects.toThrow(/not found/i)
  })

  it('throws on unknown workflow in addStep', () => {
    expect(() => {
      engine.addStep('nonexistent', { id: 'x', run: () => {} })
    }).toThrow(/not found/i)
  })

  // ── 4. Duplicate step ID throws ────────────────────────────────────────────
  it('throws on duplicate step ID within same workflow', () => {
    engine.defineWorkflow('dups', [{ id: 'a', run: () => {} }])
    expect(() => {
      engine.addStep('dups', { id: 'a', run: () => {} })
    }).toThrow(/duplicate step/i)
  })

  it('throws on duplicate step ID in defineWorkflow', () => {
    expect(() => {
      engine.defineWorkflow('dups2', [
        { id: 'a', run: () => {} },
        { id: 'a', run: () => {} },
      ])
    }).toThrow(/duplicate step/i)
  })

  // ── 5. addStep positioning ─────────────────────────────────────────────────
  it('addStep: after — inserts step after the anchor', async () => {
    const order: string[] = []
    engine.defineWorkflow('wf', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
      {
        id: 'c',
        run: () => {
          order.push('c')
        },
      },
    ])
    engine.addStep('wf', {
      id: 'b',
      after: 'a',
      run: () => {
        order.push('b')
      },
    })
    await run(engine, 'wf')
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('addStep: before — inserts step before the anchor', async () => {
    const order: string[] = []
    engine.defineWorkflow('wf2', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
      {
        id: 'c',
        run: () => {
          order.push('c')
        },
      },
    ])
    engine.addStep('wf2', {
      id: 'b',
      before: 'c',
      run: () => {
        order.push('b')
      },
    })
    await run(engine, 'wf2')
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('addStep: no anchor — appends to end', async () => {
    const order: string[] = []
    engine.defineWorkflow('wf3', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
    ])
    engine.addStep('wf3', {
      id: 'b',
      run: () => {
        order.push('b')
      },
    })
    await run(engine, 'wf3')
    expect(order).toEqual(['a', 'b'])
  })

  it('addStep: throws on missing anchor', () => {
    engine.defineWorkflow('wf4', [{ id: 'a', run: () => {} }])
    expect(() => {
      engine.addStep('wf4', { id: 'b', after: 'nonexistent', run: () => {} })
    }).toThrow(/anchor.*not found/i)
  })

  it('addStep: throws when both before and after provided', () => {
    engine.defineWorkflow('wf5', [{ id: 'a', run: () => {} }])
    expect(() => {
      engine.addStep('wf5', { id: 'b', before: 'a', after: 'a', run: () => {} })
    }).toThrow(/cannot specify both/i)
  })

  // ── 6. Priority ordering ───────────────────────────────────────────────────
  it('priority: lower priority runs first among same-anchor steps (after)', async () => {
    const order: string[] = []
    engine.defineWorkflow('prio', [
      {
        id: 'anchor',
        run: () => {
          order.push('anchor')
        },
      },
    ])
    engine.addStep('prio', {
      id: 'hi',
      after: 'anchor',
      priority: 200,
      run: () => {
        order.push('hi')
      },
    })
    engine.addStep('prio', {
      id: 'lo',
      after: 'anchor',
      priority: 50,
      run: () => {
        order.push('lo')
      },
    })
    await run(engine, 'prio')
    expect(order).toEqual(['anchor', 'lo', 'hi'])
  })

  it('priority: same priority preserves registration order', async () => {
    const order: string[] = []
    engine.defineWorkflow('prio2', [{ id: 'anchor', run: () => {} }])
    engine.addStep('prio2', {
      id: 'first',
      after: 'anchor',
      priority: 100,
      run: () => {
        order.push('first')
      },
    })
    engine.addStep('prio2', {
      id: 'second',
      after: 'anchor',
      priority: 100,
      run: () => {
        order.push('second')
      },
    })
    await run(engine, 'prio2')
    expect(order).toEqual(['first', 'second'])
  })

  it('priority: lower priority runs first among same-anchor steps (before)', async () => {
    const order: string[] = []
    engine.defineWorkflow('prio3', [
      {
        id: 'anchor',
        run: () => {
          order.push('anchor')
        },
      },
    ])
    engine.addStep('prio3', {
      id: 'hi',
      before: 'anchor',
      priority: 200,
      run: () => {
        order.push('hi')
      },
    })
    engine.addStep('prio3', {
      id: 'lo',
      before: 'anchor',
      priority: 50,
      run: () => {
        order.push('lo')
      },
    })
    await run(engine, 'prio3')
    expect(order).toEqual(['lo', 'hi', 'anchor'])
  })

  // ── 7. wrapStep ────────────────────────────────────────────────────────────
  it('wrapStep: wrapper calls original via second arg', async () => {
    const order: string[] = []
    engine.defineWorkflow('wrap', [
      {
        id: 'target',
        run: () => {
          order.push('original')
        },
      },
    ])
    engine.wrapStep('wrap', 'target', {
      run: async (ctx, original) => {
        order.push('before')
        await original(ctx)
        order.push('after')
      },
    })
    await run(engine, 'wrap')
    expect(order).toEqual(['before', 'original', 'after'])
  })

  it('wrapStep: wrapper can skip original', async () => {
    const order: string[] = []
    engine.defineWorkflow('wrap2', [
      {
        id: 'target',
        run: () => {
          order.push('original')
        },
      },
    ])
    engine.wrapStep('wrap2', 'target', {
      run: (_ctx, _original) => {
        order.push('wrapped-skip')
      },
    })
    await run(engine, 'wrap2')
    expect(order).toEqual(['wrapped-skip'])
  })

  it('wrapStep: multiple wraps form onion — lower priority = outer layer', async () => {
    const order: string[] = []
    engine.defineWorkflow('onion', [
      {
        id: 'core',
        run: () => {
          order.push('core')
        },
      },
    ])
    engine.wrapStep('onion', 'core', {
      priority: 200,
      run: async (ctx, original) => {
        order.push('inner-before')
        await original(ctx)
        order.push('inner-after')
      },
    })
    engine.wrapStep('onion', 'core', {
      priority: 50,
      run: async (ctx, original) => {
        order.push('outer-before')
        await original(ctx)
        order.push('outer-after')
      },
    })
    await run(engine, 'onion')
    expect(order).toEqual(['outer-before', 'inner-before', 'core', 'inner-after', 'outer-after'])
  })

  // ── 8. removeStep ─────────────────────────────────────────────────────────
  it('removeStep: removes the step so it no longer runs', async () => {
    const order: string[] = []
    engine.defineWorkflow('rm', [
      {
        id: 'a',
        run: () => {
          order.push('a')
        },
      },
      {
        id: 'b',
        run: () => {
          order.push('b')
        },
      },
    ])
    engine.removeStep('rm', 'a')
    await run(engine, 'rm')
    expect(order).toEqual(['b'])
  })

  it('removeStep: idempotent on missing step', () => {
    engine.defineWorkflow('rm2', [])
    // Should not throw — idempotent for cascade support
    engine.removeStep('rm2', 'nonexistent')
  })

  // ── 9. inspectWorkflow ────────────────────────────────────────────────────
  it('inspectWorkflow: returns step IDs in order', () => {
    engine.defineWorkflow('insp', [
      { id: 'a', run: () => {} },
      { id: 'b', run: () => {} },
    ])
    expect(engine.inspectWorkflow('insp')).toEqual(['a', 'b'])
  })

  it('inspectWorkflow: reflects addStep changes', () => {
    engine.defineWorkflow('insp2', [
      { id: 'a', run: () => {} },
      { id: 'c', run: () => {} },
    ])
    engine.addStep('insp2', { id: 'b', after: 'a', run: () => {} })
    expect(engine.inspectWorkflow('insp2')).toEqual(['a', 'b', 'c'])
  })

  it('inspectWorkflow: throws on unknown workflow', () => {
    expect(() => {
      engine.inspectWorkflow('nope')
    }).toThrow(/not found/i)
  })

  // ── 10. abort ─────────────────────────────────────────────────────────────
  it('abort: stops subsequent steps and returns aborted status', async () => {
    const order: string[] = []
    engine.defineWorkflow('abrt', [
      {
        id: 'a',
        run: (ctx) => {
          order.push('a')
          ctx.abort('stop')
        },
      },
      {
        id: 'b',
        run: () => {
          order.push('b')
        },
      },
    ])
    const internal = makeInternal()
    const ctx = makeCtx()
    // Wire up abort to set internal state (like createWorkflowContext does)
    ctx.abort = (reason?: string) => {
      internal.abortCtrl.aborted = true
      internal.abortCtrl.reason = reason
    }
    const result = await engine.runWorkflow('abrt', ctx, internal)
    expect(order).toEqual(['a'])
    expect(result.status).toBe('aborted')
    if (result.status === 'aborted') {
      expect(result.reason).toBe('stop')
    }
  })

  // ── 11. Error propagation (critical steps) ─────────────────────────────────
  it('error in critical step propagates immediately', async () => {
    const order: string[] = []
    engine.defineWorkflow('err', [
      {
        id: 'a',
        run: () => {
          throw new Error('boom')
        },
      },
      {
        id: 'b',
        run: () => {
          order.push('b')
        },
      },
    ])
    await expect(run(engine, 'err')).rejects.toThrow('boom')
    expect(order).toEqual([])
  })

  // ── 12. Recursion depth ───────────────────────────────────────────────────
  it('throws when recursion depth exceeds 10', async () => {
    engine.defineWorkflow('recurse', [
      {
        id: 'self',
        run: async (ctx) => {
          await ctx.runWorkflow({ name: 'recurse' } as never)
        },
      },
    ])

    // Use real createWorkflowContext for proper depth tracking (no mock needed)
    const { createWorkflowContext } = await import('./context')
    const sharedInternal = makeInternal()
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
        payload: { rolls: [], total: 0, formula: '', dice: [] },
      }),
      createEntity: vi.fn().mockResolvedValue('test:entity-1'),
      deleteEntity: vi.fn().mockResolvedValue(undefined),
      getEntity: vi.fn(),
      getAllEntities: vi.fn().mockReturnValue({}),
      engine,
      getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
      getSeatId: vi.fn().mockReturnValue('s1'),
      getLogWatermark: vi.fn().mockReturnValue(0),
      getFormulaTokens: vi.fn().mockReturnValue({}),
    }
    const ctx = createWorkflowContext(deps, {}, sharedInternal)

    await expect(engine.runWorkflow('recurse', ctx, sharedInternal)).rejects.toThrow(
      /recursion depth/i,
    )
  })

  // ── 13. Step list snapshot ──────────────────────────────────────────────
  it('step list snapshot: addStep during execution does not affect current run', async () => {
    const order: string[] = []
    engine.defineWorkflow('snap', [
      {
        id: 'a',
        run: () => {
          order.push('a')
          engine.addStep('snap', {
            id: 'injected',
            run: () => {
              order.push('injected')
            },
          })
        },
      },
      {
        id: 'b',
        run: () => {
          order.push('b')
        },
      },
    ])
    await run(engine, 'snap')
    expect(order).toEqual(['a', 'b'])
    expect(engine.inspectWorkflow('snap')).toContain('injected')
  })

  // ── 14. WorkflowResult ────────────────────────────────────────────────────
  it('returns WorkflowResult with data shallow copy', async () => {
    engine.defineWorkflow('res', [
      {
        id: 'a',
        run: (ctx) => {
          ctx.vars.value = 42
        },
      },
    ])
    const ctx = makeCtx()
    const result = await engine.runWorkflow('res', ctx, makeInternal())
    expect(result.status).toBe('completed')
    expect(result.data.value).toBe(42)
    // data is a shallow copy — mutating result.data doesn't affect ctx.vars
    result.data.value = 99
    expect(ctx.vars.value).toBe(42)
  })

  it('empty workflow returns completed result', async () => {
    engine.defineWorkflow('empty', [{ id: 'a', run: () => {} }])
    engine.removeStep('empty', 'a')
    const result = await run(engine, 'empty')
    expect(result.status).toBe('completed')
    expect(result.errors).toEqual([])
  })

  // ── 15. Non-critical readonly step fault tolerance ──────────────────────────
  it('non-critical readonly step failure: collects error, continues execution', async () => {
    const order: string[] = []
    engine.defineWorkflow('fault', [
      {
        id: 'a',
        readonly: true,
        critical: false,
        run: () => {
          throw new Error('oops')
        },
      },
      {
        id: 'b',
        run: () => {
          order.push('b')
        },
      },
    ])
    const result = await run(engine, 'fault')
    expect(order).toEqual(['b'])
    expect(result.status).toBe('completed')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.stepId).toBe('a')
    expect(result.errors[0]?.error.message).toBe('oops')
  })

  it('readonly step: writing to vars throws TypeError', async () => {
    engine.defineWorkflow('ro-write', [
      {
        id: 'setup',
        run: (ctx) => {
          ctx.vars.value = 42
        },
      },
      {
        id: 'readonly-step',
        readonly: true,
        run: (ctx) => {
          ctx.vars.value = 99 // should throw
        },
      },
    ])
    // critical: true (default) + readonly: true → TypeError propagates
    await expect(run(engine, 'ro-write')).rejects.toThrow(TypeError)
  })

  it('readonly step: can read vars but not modify', async () => {
    let readValue: unknown
    engine.defineWorkflow('ro-read', [
      {
        id: 'setup',
        run: (ctx) => {
          ctx.vars.value = 42
        },
      },
      {
        id: 'reader',
        readonly: true,
        run: (ctx) => {
          readValue = ctx.vars.value // read should work
        },
      },
    ])
    await run(engine, 'ro-read')
    expect(readValue).toBe(42)
  })

  it('forbidden combo: readonly=false + critical=false throws on defineWorkflow', () => {
    expect(() => {
      engine.defineWorkflow('forbidden', [{ id: 'a', critical: false, run: () => {} }])
    }).toThrow(/readonly must be true/i)
  })

  it('forbidden combo: readonly=false + critical=false throws on addStep', () => {
    engine.defineWorkflow('forbidden2', [{ id: 'a', run: () => {} }])
    expect(() => {
      engine.addStep('forbidden2', { id: 'b', critical: false, run: () => {} })
    }).toThrow(/readonly must be true/i)
  })

  it('phase post requires readonly: true', () => {
    engine.defineWorkflow('phase-check', [{ id: 'a', run: () => {} }])
    expect(() => {
      engine.addStep('phase-check', { id: 'b', phase: 'post', run: () => {} })
    }).toThrow(/requires readonly/i)
  })

  it('post phase steps run after output computation', async () => {
    const order: string[] = []
    let capturedOutput: unknown
    engine.defineWorkflow(
      'post-phase',
      [
        {
          id: 'main',
          run: (ctx) => {
            order.push('main')
            ctx.vars.value = 42
          },
        },
      ],
      (vars) => ({ result: (vars as { value: number }).value * 2 }),
    )
    engine.addStep('post-phase', {
      id: 'post-observer',
      readonly: true,
      critical: false,
      phase: 'post',
      run: (ctx) => {
        order.push('post')
        capturedOutput = ctx.vars.value // can still read vars
      },
    })
    const result = await run(engine, 'post-phase')
    expect(order).toEqual(['main', 'post'])
    expect(result.status).toBe('completed')
    if (result.status === 'completed') {
      expect(result.output).toEqual({ result: 84 })
    }
    expect(capturedOutput).toBe(42)
  })

  it('post phase: multiple steps sorted by priority', async () => {
    const order: string[] = []
    engine.defineWorkflow('post-prio', [
      {
        id: 'main',
        run: () => {
          order.push('main')
        },
      },
    ])
    engine.addStep('post-prio', {
      id: 'post-hi',
      readonly: true,
      critical: false,
      phase: 'post',
      priority: 200,
      run: () => {
        order.push('post-hi')
      },
    })
    engine.addStep('post-prio', {
      id: 'post-lo',
      readonly: true,
      critical: false,
      phase: 'post',
      priority: 50,
      run: () => {
        order.push('post-lo')
      },
    })
    await run(engine, 'post-prio')
    expect(order).toEqual(['main', 'post-lo', 'post-hi'])
  })

  it('post phase steps skipped when workflow is aborted', async () => {
    const order: string[] = []
    engine.defineWorkflow('post-abort', [
      {
        id: 'aborter',
        run: (ctx) => {
          order.push('aborter')
          ctx.abort('stop')
        },
      },
    ])
    engine.addStep('post-abort', {
      id: 'post-step',
      readonly: true,
      critical: false,
      phase: 'post',
      run: () => {
        order.push('post')
      },
    })
    const internal = makeInternal()
    const ctx = makeCtx()
    ctx.abort = (reason?: string) => {
      internal.abortCtrl.aborted = true
      internal.abortCtrl.reason = reason
    }
    const result = await engine.runWorkflow('post-abort', ctx, internal)
    expect(order).toEqual(['aborter'])
    expect(result.status).toBe('aborted')
  })

  // ── 16. replaceStep ────────────────────────────────────────────────────────
  it('replaceStep: replaces step run function', async () => {
    const order: string[] = []
    engine.defineWorkflow('repl', [
      {
        id: 'target',
        run: () => {
          order.push('original')
        },
      },
    ])
    engine.replaceStep('repl', 'target', {
      run: () => {
        order.push('replaced')
      },
    })
    await run(engine, 'repl')
    expect(order).toEqual(['replaced'])
  })

  it('replaceStep: second replace on same step throws', () => {
    engine.defineWorkflow('repl2', [{ id: 'target', run: () => {} }])
    engine.replaceStep('repl2', 'target', { run: () => {} })
    expect(() => {
      engine.replaceStep('repl2', 'target', { run: () => {} })
    }).toThrow(/already replaced/i)
  })

  // ── 17. attachStep + dependsOn ────────────────────────────────────────────
  it('attachStep: positions after dependency target by default', () => {
    engine.defineWorkflow('att', [
      { id: 'a', run: () => {} },
      { id: 'b', run: () => {} },
    ])
    engine.attachStep('att', { id: 'dep', to: 'a', run: () => {} })
    expect(engine.inspectWorkflow('att')).toEqual(['a', 'dep', 'b'])
  })

  it('attachStep: cascade removes dependants', () => {
    engine.defineWorkflow('cas', [
      { id: 'a', run: () => {} },
      { id: 'b', run: () => {} },
    ])
    engine.attachStep('cas', { id: 'dep', to: 'a', run: () => {} })
    engine.removeStep('cas', 'a')
    expect(engine.inspectWorkflow('cas')).toEqual(['b'])
  })

  it('attachStep: non-critical dependency failure skips dependants', async () => {
    const order: string[] = []
    engine.defineWorkflow('depfail', [
      {
        id: 'owner',
        readonly: true,
        critical: false,
        run: () => {
          throw new Error('fail')
        },
      },
      {
        id: 'end',
        run: () => {
          order.push('end')
        },
      },
    ])
    engine.attachStep('depfail', {
      id: 'dependent',
      to: 'owner',
      run: () => {
        order.push('dependent')
      },
    })
    const result = await run(engine, 'depfail')
    expect(order).toEqual(['end'])
    expect(result.errors).toHaveLength(1)
  })

  it('attachStep: throws on missing dependency target', () => {
    engine.defineWorkflow('att2', [{ id: 'a', run: () => {} }])
    expect(() => {
      engine.attachStep('att2', { id: 'dep', to: 'nonexistent', run: () => {} })
    }).toThrow(/not found/i)
  })

  // ── 18. Plugin lifecycle ──────────────────────────────────────────────────
  it('deactivatePlugin: removes owned steps and wrappers', () => {
    engine.defineWorkflow('plug', [{ id: 'base', run: () => {} }])
    engine.setCurrentPluginOwner('plugin-a')
    engine.addStep('plug', { id: 'pa:step', after: 'base', run: () => {} })
    engine.wrapStep('plug', 'base', {
      run: async (ctx, orig) => {
        await orig(ctx)
      },
    })
    engine.setCurrentPluginOwner(undefined)

    expect(engine.inspectWorkflow('plug')).toEqual(['base', 'pa:step'])
    engine.deactivatePlugin('plugin-a')
    expect(engine.inspectWorkflow('plug')).toEqual(['base'])
  })

  it('deactivatePlugin: restores replaced step originalRun', async () => {
    const order: string[] = []
    engine.defineWorkflow('restr', [
      {
        id: 'target',
        run: () => {
          order.push('original')
        },
      },
    ])
    engine.setCurrentPluginOwner('plugin-b')
    engine.replaceStep('restr', 'target', {
      run: () => {
        order.push('replaced')
      },
    })
    engine.setCurrentPluginOwner(undefined)

    await run(engine, 'restr')
    expect(order).toEqual(['replaced'])

    order.length = 0
    engine.deactivatePlugin('plugin-b')
    await run(engine, 'restr')
    expect(order).toEqual(['original'])
  })

  // ── 19. defineWorkflow returns WorkflowHandle ─────────────────────────────
  it('defineWorkflow returns a handle with the workflow name', () => {
    const handle = engine.defineWorkflow('typed', [{ id: 'a', run: () => {} }])
    expect(handle.name).toBe('typed')
  })

  // ── 20. Transitive dependsOn cascade (A→B→C) ─────────────────────────────
  it('attachStep: transitive dependency failure cascades (A→B→C, A fails → B,C skipped)', async () => {
    const order: string[] = []
    engine.defineWorkflow('cascade', [
      {
        id: 'A',
        readonly: true,
        critical: false,
        run: () => {
          order.push('A')
          throw new Error('A failed')
        },
      },
    ])
    // B depends on A
    engine.attachStep('cascade', {
      id: 'B',
      to: 'A',
      run: () => {
        order.push('B')
      },
    })
    // C depends on B (transitive: C→B→A)
    engine.attachStep('cascade', {
      id: 'C',
      to: 'B',
      run: () => {
        order.push('C')
      },
    })
    // D has no dependency — should still run
    engine.addStep('cascade', {
      id: 'D',
      after: 'C',
      run: () => {
        order.push('D')
      },
    })

    const data: Record<string, unknown> = {}
    const result = await engine.runWorkflow('cascade', makeCtx(data), makeInternal())
    expect(order).toEqual(['A', 'D'])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.stepId).toBe('A')
  })

  // ── 21. Wrapper snapshot isolation ────────────────────────────────────────
  it('wrapper added during execution does not affect current run', async () => {
    const order: string[] = []
    engine.defineWorkflow('wsnapshot', [
      {
        id: 'first',
        run: () => {
          order.push('first')
          // Add a wrapper to 'second' during execution — should not apply
          engine.wrapStep('wsnapshot', 'second', {
            run: (ctx, original) => {
              order.push('late-wrapper')
              return original(ctx)
            },
          })
        },
      },
      {
        id: 'second',
        run: () => {
          order.push('second')
        },
      },
    ])
    await run(engine, 'wsnapshot')
    // The late wrapper should NOT have been picked up in this execution
    expect(order).toEqual(['first', 'second'])

    // But on a second run, the wrapper IS present
    order.length = 0
    await run(engine, 'wsnapshot')
    expect(order).toEqual(['first', 'late-wrapper', 'second'])
  })

  // ── 22. wrapStep/replaceStep target not found ──────────────────────────────
  it('wrapStep throws when target step does not exist', () => {
    engine.defineWorkflow('notarget', [{ id: 'a', run: () => {} }])
    expect(() => {
      engine.wrapStep('notarget', 'nonexistent', { run: vi.fn() })
    }).toThrow('Step "nonexistent" not found')
  })

  it('replaceStep throws when target step does not exist', () => {
    engine.defineWorkflow('notarget2', [{ id: 'a', run: () => {} }])
    expect(() => {
      engine.replaceStep('notarget2', 'nonexistent', { run: vi.fn() })
    }).toThrow('Step "nonexistent" not found')
  })

  // ── 24. Circular dependency detection in attachStep ─────────────────────
  it('attachStep: self-dependency throws circular error', () => {
    engine.defineWorkflow('selfref', [{ id: 'a', run: () => {} }])
    // 'a' exists, try to attach a new step 'a' depending on itself
    // checkCircularDependency runs before addStep's duplicate check,
    // walking the chain: current='a', check 'a'==='a' → circular
    expect(() => {
      engine.attachStep('selfref', { id: 'a', to: 'a', run: () => {} })
    }).toThrow(/circular dependency/i)
  })

  it('attachStep: valid chain does not trigger circular detection', () => {
    engine.defineWorkflow('noCirc', [{ id: 'root', run: () => {} }])
    engine.attachStep('noCirc', { id: 'a', to: 'root', run: () => {} })
    engine.attachStep('noCirc', { id: 'b', to: 'a', run: () => {} })
    engine.attachStep('noCirc', { id: 'c', to: 'b', run: () => {} })
    // No cycle — should not throw
    expect(engine.inspectWorkflow('noCirc')).toContain('c')
  })

  // ── 25. attachStep with explicit before/after override ─────────────────
  it('attachStep: explicit before overrides default after positioning', () => {
    engine.defineWorkflow('attach-pos', [
      { id: 'a', run: () => {} },
      { id: 'b', run: () => {} },
      { id: 'c', run: () => {} },
    ])
    // dep depends on 'c' (lifecycle) but positioned before 'b'
    engine.attachStep('attach-pos', { id: 'dep', to: 'c', before: 'b', run: () => {} })
    expect(engine.inspectWorkflow('attach-pos')).toEqual(['a', 'dep', 'b', 'c'])
  })

  it('attachStep: explicit after overrides default positioning', () => {
    engine.defineWorkflow('attach-pos2', [
      { id: 'a', run: () => {} },
      { id: 'b', run: () => {} },
      { id: 'c', run: () => {} },
    ])
    // dep depends on 'a' (lifecycle) but positioned after 'c'
    engine.attachStep('attach-pos2', { id: 'dep', to: 'a', after: 'c', run: () => {} })
    expect(engine.inspectWorkflow('attach-pos2')).toEqual(['a', 'b', 'c', 'dep'])
  })

  // ── 26. deactivatePlugin with unknown plugin ID ────────────────────────
  it('deactivatePlugin: no-op for unknown plugin ID', () => {
    engine.defineWorkflow('no-op', [
      { id: 'a', run: () => {} },
      { id: 'b', run: () => {} },
    ])
    // Should not throw, should not modify anything
    engine.deactivatePlugin('nonexistent-plugin')
    expect(engine.inspectWorkflow('no-op')).toEqual(['a', 'b'])
  })

  // ── 27. Step that is both wrapped and replaced ─────────────────────────
  it('wrapStep + replaceStep: wrapper composes around replaced run', async () => {
    const order: string[] = []
    engine.defineWorkflow('wrap-repl', [
      {
        id: 'target',
        run: () => {
          order.push('original')
        },
      },
    ])
    // First wrap, then replace
    engine.wrapStep('wrap-repl', 'target', {
      run: async (ctx, original) => {
        order.push('wrapper-before')
        await original(ctx)
        order.push('wrapper-after')
      },
    })
    engine.replaceStep('wrap-repl', 'target', {
      run: () => {
        order.push('replaced')
      },
    })
    await run(engine, 'wrap-repl')
    // Wrapper wraps the replaced run (since replace mutates meta.step.run,
    // and wrapper captures baseFn at execution time from the snapshot)
    expect(order).toEqual(['wrapper-before', 'replaced', 'wrapper-after'])
  })

  it('replaceStep + wrapStep: order of registration does not matter (same result)', async () => {
    const order: string[] = []
    engine.defineWorkflow('repl-wrap', [
      {
        id: 'target',
        run: () => {
          order.push('original')
        },
      },
    ])
    // Replace first, then wrap
    engine.replaceStep('repl-wrap', 'target', {
      run: () => {
        order.push('replaced')
      },
    })
    engine.wrapStep('repl-wrap', 'target', {
      run: async (ctx, original) => {
        order.push('wrapper-before')
        await original(ctx)
        order.push('wrapper-after')
      },
    })
    await run(engine, 'repl-wrap')
    expect(order).toEqual(['wrapper-before', 'replaced', 'wrapper-after'])
  })

  // ── 28. Recursion depth boundary ──────────────────────────────────────────
  it('recursion depth 9 succeeds (just under limit)', async () => {
    let maxDepth = 0
    engine.defineWorkflow('depth9', [
      {
        id: 'recurse',
        run: async (ctx) => {
          const d = (typeof ctx.vars.depth === 'number' ? ctx.vars.depth : 0) + 1
          ctx.vars.depth = d
          if (d > maxDepth) maxDepth = d
          if (d < 9) {
            await ctx.runWorkflow({ name: 'depth9' } as never, { depth: d })
          }
        },
      },
    ])
    // Use real createWorkflowContext + shared internal for proper depth tracking
    const { createWorkflowContext } = await import('./context')
    const internal = makeInternal()
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
        payload: { rolls: [], total: 0, formula: '', dice: [] },
      }),
      createEntity: vi.fn().mockResolvedValue('test:entity-1'),
      deleteEntity: vi.fn().mockResolvedValue(undefined),
      getEntity: vi.fn(),
      getAllEntities: vi.fn().mockReturnValue({}),
      engine,
      getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
      getSeatId: vi.fn().mockReturnValue('s1'),
      getLogWatermark: vi.fn().mockReturnValue(0),
      getFormulaTokens: vi.fn().mockReturnValue({}),
    }
    const ctx = createWorkflowContext(deps, {}, internal)
    const result = await engine.runWorkflow('depth9', ctx, internal)
    expect(result.status).toBe('completed')
    expect(maxDepth).toBe(9)
  })
})
