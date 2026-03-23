import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSessionStore, requestInput, resolveInput, cancelInput } from '../sessionStore'
import { WorkflowEngine } from '../../workflow/engine'
import { createWorkflowContext } from '../../workflow/context'
import { createEventBus } from '../../events/eventBus'
import type { InternalState } from '../../workflow/types'

beforeEach(() => {
  useSessionStore.setState({ selection: [], pendingInteractions: new Map() })
})

describe('requestInput — pause/resume/cancel', () => {
  it('requestInput pauses (Promise hangs until resolved)', async () => {
    let resolved = false
    const promise = requestInput('interaction-1').then(() => {
      resolved = true
    })

    await Promise.resolve()
    expect(resolved).toBe(false)
    expect(useSessionStore.getState().pendingInteractions.has('interaction-1')).toBe(true)

    resolveInput('interaction-1', 'done')
    await promise
    expect(resolved).toBe(true)
  })

  it('resolveInput resumes workflow with value', async () => {
    const promise = requestInput('interaction-2')

    resolveInput('interaction-2', { x: 10, y: 20 })
    const result = await promise
    expect(result).toEqual({ x: 10, y: 20 })
    expect(useSessionStore.getState().pendingInteractions.has('interaction-2')).toBe(false)
  })

  it('cancelInput rejects with cancelled error', async () => {
    const promise = requestInput('interaction-3')

    cancelInput('interaction-3')
    await expect(promise).rejects.toThrow('cancelled')
    expect(useSessionStore.getState().pendingInteractions.has('interaction-3')).toBe(false)
  })

  it('multiple parallel interactions supported', async () => {
    const p1 = requestInput('ia-1')
    const p2 = requestInput('ia-2')

    expect(useSessionStore.getState().pendingInteractions.size).toBe(2)

    resolveInput('ia-2', 'second')
    resolveInput('ia-1', 'first')

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe('first')
    expect(r2).toBe('second')
    expect(useSessionStore.getState().pendingInteractions.size).toBe(0)
  })

  it('resolveInput on unknown id is a no-op', () => {
    resolveInput('nonexistent', 'value')
  })

  it('cancelInput on unknown id is a no-op', () => {
    cancelInput('nonexistent')
  })
})

describe('ctx.requestInput — workflow integration', () => {
  it('async step can pause via ctx.requestInput and resume on resolveInput', async () => {
    const engine = new WorkflowEngine()
    const bus = createEventBus()
    const deps = {
      sendRoll: vi.fn(),
      updateEntity: vi.fn(),
      updateTeamTracker: vi.fn(),
      getEntity: vi.fn(),
      getAllEntities: vi.fn().mockReturnValue({}),
      eventBus: bus,
      engine,
    }

    engine.defineWorkflow('test:interactive', [
      {
        id: 'ask-user',
        run: async (ctx) => {
          const answer = await ctx.requestInput('pick-target')
          ctx.state.answer = answer
        },
      },
    ])

    const internal: InternalState = {
      depth: 0,
      abortCtrl: { aborted: false },
      dataCtrl: { getInner: () => ({}), replaceInner: () => {} },
    }
    const ctx = createWorkflowContext(deps, {}, internal)

    const resultPromise = engine.runWorkflow('test:interactive', ctx, internal)

    // Step should be paused
    await Promise.resolve()
    expect(useSessionStore.getState().pendingInteractions.has('pick-target')).toBe(true)

    // Resolve from UI side
    resolveInput('pick-target', 'entity-42')

    const result = await resultPromise
    expect(result.status).toBe('completed')
    expect(result.data.answer).toBe('entity-42')
  })
})
