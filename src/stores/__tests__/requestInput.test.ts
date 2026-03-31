import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSessionStore, requestInput, resolveInput, cancelInput } from '../sessionStore'
import { WorkflowEngine } from '../../workflow/engine'
import { createWorkflowContext } from '../../workflow/context'
import type { InternalState } from '../../workflow/types'

beforeEach(() => {
  useSessionStore.setState({ selection: [], pendingInteractions: new Map() })
})

describe('requestInput — InputResult API', () => {
  it('requestInput pauses (Promise hangs until resolved)', async () => {
    let settled = false
    const promise = requestInput('test:modifier').then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    expect(useSessionStore.getState().pendingInteractions.size).toBe(1)

    const [interactionId] = [...useSessionStore.getState().pendingInteractions.keys()]
    resolveInput(interactionId!, 'done')
    await promise
    expect(settled).toBe(true)
  })

  it('resolveInput returns ok result with value', async () => {
    const promise = requestInput<{ x: number }>('test:position')

    const [interactionId] = [...useSessionStore.getState().pendingInteractions.keys()]
    resolveInput(interactionId!, { x: 10 })

    const result = await promise
    expect(result).toEqual({ ok: true, value: { x: 10 } })
  })

  it('cancelInput returns cancelled result (not rejection)', async () => {
    const promise = requestInput('test:confirm')

    const [interactionId] = [...useSessionStore.getState().pendingInteractions.keys()]
    cancelInput(interactionId!)

    const result = await promise
    expect(result).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('stores inputType and context in PendingInteraction', () => {
    requestInput('test:modifier', { context: { attr: 'str' } })

    const [, pending] = [...useSessionStore.getState().pendingInteractions.entries()][0]!
    expect(pending.inputType).toBe('test:modifier')
    expect(pending.context).toEqual({ attr: 'str' })
  })

  it('multiple parallel interactions supported', async () => {
    const p1 = requestInput('test:a')
    const p2 = requestInput('test:b')

    expect(useSessionStore.getState().pendingInteractions.size).toBe(2)

    const ids = [...useSessionStore.getState().pendingInteractions.keys()]
    resolveInput(ids[1]!, 'second')
    resolveInput(ids[0]!, 'first')

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual({ ok: true, value: 'first' })
    expect(r2).toEqual({ ok: true, value: 'second' })
    expect(useSessionStore.getState().pendingInteractions.size).toBe(0)
  })

  it('timeout returns timeout result', async () => {
    vi.useFakeTimers()

    const promise = requestInput('test:timed', { timeout: 5000 })

    vi.advanceTimersByTime(5000)

    const result = await promise
    expect(result).toEqual({ ok: false, reason: 'timeout' })
    expect(useSessionStore.getState().pendingInteractions.size).toBe(0)

    vi.useRealTimers()
  })

  it('resolveInput on unknown id is a no-op', () => {
    resolveInput('nonexistent', 'value')
  })

  it('cancelInput on unknown id is a no-op', () => {
    cancelInput('nonexistent')
  })
})

describe('ctx.requestInput — workflow integration with InputResult', () => {
  const makeDeps = () => ({
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue({
      seq: 0,
      id: '',
      type: '',
      origin: { seat: { id: '', name: '', color: '' } },
      executor: '',
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      baseSeq: 0,
      payload: {},
      timestamp: 0,
    }),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    engine: new WorkflowEngine(),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: '', name: '', color: '' } }),
    getSeatId: vi.fn().mockReturnValue(''),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
  })

  it('workflow step receives InputResult on resolve', async () => {
    const deps = makeDeps()
    deps.engine.defineWorkflow('test:input-result', [
      {
        id: 'ask',
        run: async (ctx) => {
          const result = await ctx.requestInput('test:choice', { context: { options: ['a', 'b'] } })
          ctx.vars.result = result
        },
      },
    ])

    const internal: InternalState = { depth: 0, abortCtrl: { aborted: false } }
    const ctxObj = createWorkflowContext(deps, {}, internal)
    const resultPromise = deps.engine.runWorkflow('test:input-result', ctxObj, internal)

    await Promise.resolve()
    const [interactionId] = [...useSessionStore.getState().pendingInteractions.keys()]
    expect(interactionId).toBeDefined()

    resolveInput(interactionId!, 'picked-a')

    const wfResult = await resultPromise
    expect(wfResult.status).toBe('completed')
    expect(wfResult.data.result).toEqual({ ok: true, value: 'picked-a' })
  })

  it('workflow step receives cancelled InputResult', async () => {
    const deps = makeDeps()
    deps.engine.defineWorkflow('test:input-cancel', [
      {
        id: 'ask',
        run: async (ctx) => {
          const result = await ctx.requestInput('test:choice')
          ctx.vars.result = result
        },
      },
    ])

    const internal: InternalState = { depth: 0, abortCtrl: { aborted: false } }
    const ctxObj = createWorkflowContext(deps, {}, internal)
    const resultPromise = deps.engine.runWorkflow('test:input-cancel', ctxObj, internal)

    await Promise.resolve()
    const [interactionId] = [...useSessionStore.getState().pendingInteractions.keys()]
    cancelInput(interactionId!)

    const wfResult = await resultPromise
    expect(wfResult.status).toBe('completed')
    expect(wfResult.data.result).toEqual({ ok: false, reason: 'cancelled' })
  })
})
