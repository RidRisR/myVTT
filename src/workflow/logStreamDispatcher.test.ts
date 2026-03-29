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
  // Extract vi.fn() references to avoid @typescript-eslint/unbound-method on expect()
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
      getWatermark: () => 5,
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
    // groupId should be a non-empty string (uuidv7)
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
    // Verify serial order: first call was wf1, second was wf2
    const firstHandle = (runWorkflow.mock.calls[0] as [{ name: string }, unknown])[0]
    const secondHandle = (runWorkflow.mock.calls[1] as [{ name: string }, unknown])[0]
    expect(firstHandle.name).toBe('wf1')
    expect(secondHandle.name).toBe('wf2')
  })

  it('skips dispatch when seq <= watermark (history replay protection)', async () => {
    const entry = makeEntry({ seq: 5 })
    await dispatcher.dispatch(entry)

    expect(getMatchingTriggers).not.toHaveBeenCalled()
    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('also skips dispatch when seq is strictly below watermark', async () => {
    const entry = makeEntry({ seq: 3 })
    await dispatcher.dispatch(entry)

    expect(getMatchingTriggers).not.toHaveBeenCalled()
    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('respects dynamic watermark from getter', async () => {
    let watermark = 5
    dispatcher = new LogStreamDispatcher({
      triggerRegistry: mockRegistry,
      runner: mockRunner,
      getSeatId: () => 'seat-a',
      getWatermark: () => watermark,
    })

    // Entry with seq=10 dispatches normally
    getMatchingTriggers.mockReturnValue([makeTrigger('t1')])
    await dispatcher.dispatch(makeEntry({ seq: 10 }))
    expect(runWorkflow).toHaveBeenCalledTimes(1)

    // Watermark advances externally
    watermark = 15
    runWorkflow.mockClear()

    // Entry with seq=12 now below watermark — skipped
    await dispatcher.dispatch(makeEntry({ seq: 12 }))
    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('respects dynamic seatId from getter', async () => {
    let seatId = 'seat-a'
    dispatcher = new LogStreamDispatcher({
      triggerRegistry: mockRegistry,
      runner: mockRunner,
      getSeatId: () => seatId,
      getWatermark: () => 5,
    })

    getMatchingTriggers.mockReturnValue([makeTrigger('t1')])

    // Matches seat-a
    await dispatcher.dispatch(makeEntry({ executor: 'seat-a', seq: 10 }))
    expect(runWorkflow).toHaveBeenCalledTimes(1)

    // seatId changes
    seatId = 'seat-b'
    runWorkflow.mockClear()

    // Now seat-a doesn't match
    await dispatcher.dispatch(makeEntry({ executor: 'seat-a', seq: 11 }))
    expect(runWorkflow).not.toHaveBeenCalled()

    // seat-b matches
    await dispatcher.dispatch(makeEntry({ executor: 'seat-b', seq: 12 }))
    expect(runWorkflow).toHaveBeenCalledTimes(1)
  })
})
