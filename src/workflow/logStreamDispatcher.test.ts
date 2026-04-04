// src/workflow/logStreamDispatcher.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LogStreamDispatcher } from './logStreamDispatcher'
import type { TriggerRegistry } from './triggerRegistry'
import type { IWorkflowRunner } from './types'
import type { GameLogEntry, TriggerDefinition } from '../shared/logTypes'
import { MAX_CHAIN_DEPTH } from '../shared/logTypes'

function makeEntry(overrides: Partial<GameLogEntry> = {}): GameLogEntry {
  return {
    seq: 10,
    id: 'entry-1',
    type: 'roll:completed',
    origin: { seat: 'seat-a' } as unknown as GameLogEntry['origin'],
    executor: 'seat-a',
    chainDepth: 0,
    triggerable: true,
    visibility: {},
    baseSeq: 10,
    payload: {},
    timestamp: Date.now(),
    ...overrides,
  } as unknown as GameLogEntry
}

function makeTrigger(
  id: string,
  workflow = 'wf1',
  mapInput?: (entry: GameLogEntry) => Record<string, unknown>,
): TriggerDefinition {
  return {
    id,
    on: 'roll:completed',
    workflow,
    mapInput: mapInput ?? ((entry) => entry.payload),
    executeAs: 'triggering-executor',
  }
}

describe('LogStreamDispatcher', () => {
  let mockRegistry: TriggerRegistry
  let mockRunner: IWorkflowRunner
  let dispatcher: LogStreamDispatcher
  let getMatchingTriggers: ReturnType<typeof vi.fn>
  let runWorkflow: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getMatchingTriggers = vi.fn()
    runWorkflow = vi
      .fn()
      .mockResolvedValue({ status: 'completed', data: {}, output: {}, errors: [] })

    mockRegistry = {
      getMatchingTriggers,
      register: vi.fn(),
      clear: vi.fn(),
    } as unknown as TriggerRegistry

    mockRunner = {
      runWorkflow,
    } as unknown as IWorkflowRunner

    dispatcher = new LogStreamDispatcher({
      triggerRegistry: mockRegistry,
      runner: mockRunner,
      getSeatId: () => 'seat-a',
    })
  })

  it('runs workflow when entry is triggerable, executor matches, and trigger exists', async () => {
    const trigger = makeTrigger('t1', 'wf1')
    getMatchingTriggers.mockReturnValue([trigger])

    const entry = makeEntry({ triggerable: true, executor: 'seat-a', seq: 10, chainDepth: 0 })
    await dispatcher.dispatch(entry)

    expect(getMatchingTriggers).toHaveBeenCalledWith(entry)
    expect(runWorkflow).toHaveBeenCalledWith(
      { name: 'wf1' },
      entry.payload,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher returns any
      { groupId: expect.any(String), causedBy: entry.id, chainDepth: entry.chainDepth + 1 },
    )
  })

  it('passes ChainContext with new groupId, causedBy, and incremented chainDepth', async () => {
    const trigger = makeTrigger('t1', 'wf1')
    getMatchingTriggers.mockReturnValue([trigger])

    const entry = makeEntry({ id: 'entry-abc', chainDepth: 3, seq: 10, executor: 'seat-a' })
    await dispatcher.dispatch(entry)

    expect(runWorkflow).toHaveBeenCalledTimes(1)
    const chainCtx = (runWorkflow.mock.calls[0] as unknown[])[2] as Record<string, unknown>
    expect(chainCtx).toEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest matcher returns any
      groupId: expect.any(String),
      causedBy: 'entry-abc',
      chainDepth: 4,
    })
    expect(typeof chainCtx.groupId).toBe('string')
    expect((chainCtx.groupId as string).length).toBeGreaterThan(0)
  })

  it('skips dispatch when entry is not triggerable', async () => {
    const entry = makeEntry({ triggerable: false })
    await dispatcher.dispatch(entry)

    expect(getMatchingTriggers).not.toHaveBeenCalled()
    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('skips dispatch when chainDepth >= MAX_CHAIN_DEPTH', async () => {
    const entry = makeEntry({ triggerable: true, chainDepth: MAX_CHAIN_DEPTH })
    await dispatcher.dispatch(entry)

    expect(getMatchingTriggers).not.toHaveBeenCalled()
    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('skips dispatch when executor does not match localSeatId', async () => {
    const entry = makeEntry({ triggerable: true, executor: 'seat-b' })
    await dispatcher.dispatch(entry)

    expect(getMatchingTriggers).not.toHaveBeenCalled()
    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('executes all matching triggers serially', async () => {
    const t1 = makeTrigger('t1', 'wf1')
    const t2 = makeTrigger('t2', 'wf2')
    getMatchingTriggers.mockReturnValue([t1, t2])

    const entry = makeEntry()
    await dispatcher.dispatch(entry)

    expect(runWorkflow).toHaveBeenCalledTimes(2)
    const firstHandle = (runWorkflow.mock.calls[0] as [{ name: string }, unknown])[0]
    const secondHandle = (runWorkflow.mock.calls[1] as [{ name: string }, unknown])[0]
    expect(firstHandle.name).toBe('wf1')
    expect(secondHandle.name).toBe('wf2')
  })

  it('respects dynamic seatId from getter', async () => {
    let seatId = 'seat-a'
    dispatcher = new LogStreamDispatcher({
      triggerRegistry: mockRegistry,
      runner: mockRunner,
      getSeatId: () => seatId,
    })

    getMatchingTriggers.mockReturnValue([makeTrigger('t1')])

    await dispatcher.dispatch(makeEntry({ executor: 'seat-a', seq: 10 }))
    expect(runWorkflow).toHaveBeenCalledTimes(1)

    seatId = 'seat-b'
    runWorkflow.mockClear()

    await dispatcher.dispatch(makeEntry({ executor: 'seat-a', seq: 11 }))
    expect(runWorkflow).not.toHaveBeenCalled()

    await dispatcher.dispatch(makeEntry({ executor: 'seat-b', seq: 12 }))
    expect(runWorkflow).toHaveBeenCalledTimes(1)
  })

  // ── Cursor / startFrom / catchUp tests ──

  it('startFrom sets initial cursor — entries at or below are skipped', async () => {
    getMatchingTriggers.mockReturnValue([makeTrigger('t1')])

    dispatcher.startFrom(10)

    await dispatcher.dispatch(makeEntry({ seq: 8 }))
    expect(runWorkflow).not.toHaveBeenCalled()

    await dispatcher.dispatch(makeEntry({ seq: 10 }))
    expect(runWorkflow).not.toHaveBeenCalled()

    await dispatcher.dispatch(makeEntry({ seq: 11, id: 'e11' }))
    expect(runWorkflow).toHaveBeenCalledTimes(1)
  })

  it('catchUp dispatches only entries above cursor', () => {
    getMatchingTriggers.mockReturnValue([makeTrigger('t1')])

    dispatcher.startFrom(10)

    const entries = [
      makeEntry({ seq: 3, id: 'e3' }),
      makeEntry({ seq: 8, id: 'e8' }),
      makeEntry({ seq: 12, id: 'e12' }),
      makeEntry({ seq: 15, id: 'e15' }),
    ]
    dispatcher.catchUp(entries)

    // Only seq 12 and 15 should be dispatched
    expect(runWorkflow).toHaveBeenCalledTimes(2)
  })

  it('dispatch is idempotent — same seq dispatched twice only executes once', async () => {
    getMatchingTriggers.mockReturnValue([makeTrigger('t1')])

    const entry = makeEntry({ seq: 10 })
    await dispatcher.dispatch(entry)
    expect(runWorkflow).toHaveBeenCalledTimes(1)

    runWorkflow.mockClear()
    await dispatcher.dispatch(entry)
    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('cursor advances — later dispatch of lower seq is skipped', async () => {
    getMatchingTriggers.mockReturnValue([makeTrigger('t1')])

    await dispatcher.dispatch(makeEntry({ seq: 10 }))
    expect(runWorkflow).toHaveBeenCalledTimes(1)

    runWorkflow.mockClear()
    await dispatcher.dispatch(makeEntry({ seq: 8 }))
    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('catchUp + subsequent dispatch have no overlap', async () => {
    getMatchingTriggers.mockReturnValue([makeTrigger('t1')])

    dispatcher.startFrom(5)

    // catchUp processes seq 10
    dispatcher.catchUp([makeEntry({ seq: 10, id: 'e10' })])
    expect(runWorkflow).toHaveBeenCalledTimes(1)

    runWorkflow.mockClear()

    // subscribe callback also sees seq 10 — should be skipped
    await dispatcher.dispatch(makeEntry({ seq: 10, id: 'e10' }))
    expect(runWorkflow).not.toHaveBeenCalled()

    // New entry seq 11 — should dispatch
    await dispatcher.dispatch(makeEntry({ seq: 11, id: 'e11' }))
    expect(runWorkflow).toHaveBeenCalledTimes(1)
  })
})
