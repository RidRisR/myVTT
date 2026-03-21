// src/workflow/engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowEngine } from './engine'
import type { WorkflowContext } from './types'

function makeCtx(data: Record<string, unknown> = {}): WorkflowContext {
  return {
    data,
    serverRoll: vi.fn(),
    updateEntity: vi.fn(),
    updateTeamTracker: vi.fn(),
    announce: vi.fn(),
    showToast: vi.fn(),
    playAnimation: vi.fn(),
    playSound: vi.fn(),
    abort: vi.fn(),
    runWorkflow: vi.fn(),
  }
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
    await engine.runWorkflow('test', makeCtx())
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
    await expect(engine.runWorkflow('nonexistent', makeCtx())).rejects.toThrow(/not found/i)
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
    await engine.runWorkflow('wf', makeCtx())
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
    await engine.runWorkflow('wf2', makeCtx())
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
    await engine.runWorkflow('wf3', makeCtx())
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
    await engine.runWorkflow('prio', makeCtx())
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
    await engine.runWorkflow('prio2', makeCtx())
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
    await engine.runWorkflow('prio3', makeCtx())
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
    await engine.runWorkflow('wrap', makeCtx())
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
    await engine.runWorkflow('wrap2', makeCtx())
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
    // inner layer (priority 200)
    engine.wrapStep('onion', 'core', {
      priority: 200,
      run: async (ctx, original) => {
        order.push('inner-before')
        await original(ctx)
        order.push('inner-after')
      },
    })
    // outer layer (priority 50)
    engine.wrapStep('onion', 'core', {
      priority: 50,
      run: async (ctx, original) => {
        order.push('outer-before')
        await original(ctx)
        order.push('outer-after')
      },
    })
    await engine.runWorkflow('onion', makeCtx())
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
    await engine.runWorkflow('rm', makeCtx())
    expect(order).toEqual(['b'])
  })

  it('removeStep: throws when step not found', () => {
    engine.defineWorkflow('rm2', [])
    expect(() => {
      engine.removeStep('rm2', 'nonexistent')
    }).toThrow(/not found/i)
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
  it('abort: stops subsequent steps', async () => {
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
    await engine.runWorkflow('abrt', makeCtx())
    expect(order).toEqual(['a'])
  })

  // ── 11. Error propagation ─────────────────────────────────────────────────
  it('error in step stops subsequent steps and propagates', async () => {
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
    await expect(engine.runWorkflow('err', makeCtx())).rejects.toThrow('boom')
    expect(order).toEqual([])
  })

  // ── 12. Recursion depth ───────────────────────────────────────────────────
  it('throws when recursion depth exceeds 10', async () => {
    engine.defineWorkflow('recurse', [
      {
        id: 'self',
        run: async (_ctx) => {
          await _ctx.runWorkflow('recurse')
        },
      },
    ])

    // Create a ctx where runWorkflow delegates back to engine
    function createNestedCtx(
      eng: WorkflowEngine,
      data: Record<string, unknown> = {},
    ): WorkflowContext {
      const c = makeCtx(data)
      const nestedRun = (name: string, d?: Record<string, unknown>): Promise<void> =>
        eng.runWorkflow(name, createNestedCtx(eng, d))
      // Cast needed: mockImplementation types its arg as void-returning, but async is valid at runtime
      ;(c.runWorkflow as ReturnType<typeof vi.fn>).mockImplementation(
        nestedRun as unknown as () => void,
      )
      return c
    }

    const ctx = createNestedCtx(engine)
    await expect(engine.runWorkflow('recurse', ctx)).rejects.toThrow(/recursion depth/i)
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
    await engine.runWorkflow('snap', makeCtx())
    expect(order).toEqual(['a', 'b'])
    expect(engine.inspectWorkflow('snap')).toContain('injected')
  })

  // ── 14. Empty workflow ────────────────────────────────────────────────────
  it('empty workflow (all steps removed) runs silently', async () => {
    engine.defineWorkflow('empty', [{ id: 'a', run: () => {} }])
    engine.removeStep('empty', 'a')
    await expect(engine.runWorkflow('empty', makeCtx())).resolves.toBeUndefined()
  })
})
