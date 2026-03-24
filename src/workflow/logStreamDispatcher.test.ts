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
      localSeatId: 'seat-a',
      watermark: 5,
    })
  })

  it('runs workflow when entry is triggerable, executor matches, and trigger exists', async () => {
    const trigger = makeTrigger('t1', 'wf1')
    getMatchingTriggers.mockReturnValue([trigger])

    const entry = makeEntry({ triggerable: true, executor: 'seat-a', seq: 10, chainDepth: 0 })
    await dispatcher.dispatch(entry)

    expect(getMatchingTriggers).toHaveBeenCalledWith(entry)
    expect(runWorkflow).toHaveBeenCalledWith({ name: 'wf1' }, entry.payload)
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

  it('updateWatermark() updates the watermark to the larger value', async () => {
    dispatcher.updateWatermark(20)

    // Entry with seq=15 should now be below the new watermark and be skipped
    const entry = makeEntry({ seq: 15 })
    await dispatcher.dispatch(entry)

    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('updateWatermark() does not decrease the watermark', async () => {
    dispatcher.updateWatermark(3)

    // Watermark should remain at 5 (original), so seq=5 should still be skipped
    const entry = makeEntry({ seq: 5 })
    await dispatcher.dispatch(entry)

    expect(runWorkflow).not.toHaveBeenCalled()
  })
})
