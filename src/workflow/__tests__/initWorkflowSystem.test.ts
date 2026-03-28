import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resetWorkflowEngine,
  registerWorkflowPlugins,
  initWorkflowSystem,
  getCommand,
} from '../useWorkflowSDK'
import { useWorldStore } from '../../stores/worldStore'
import { useIdentityStore } from '../../stores/identityStore'
import type { VTTPlugin } from '../../rules/types'
import type { GameLogEntry } from '../../shared/logTypes'

function makeEntry(overrides: Partial<GameLogEntry> = {}): GameLogEntry {
  return {
    seq: 1,
    id: 'entry-1',
    type: 'core:text',
    origin: { seat: { id: 'seat-a', name: 'Test', color: '#fff' } },
    executor: 'seat-a',
    chainDepth: 0,
    triggerable: true,
    visibility: {},
    baseSeq: 1,
    payload: { content: 'hello' },
    timestamp: Date.now(),
    ...overrides,
  } as GameLogEntry
}

describe('initWorkflowSystem', () => {
  let cleanup: () => void

  beforeEach(() => {
    resetWorkflowEngine()
    useIdentityStore.setState({ mySeatId: 'seat-a' })
    useWorldStore.setState({
      logEntries: [],
      logEntriesById: {},
      logWatermark: 0,
    })
  })

  afterEach(() => {
    cleanup?.()
    resetWorkflowEngine()
  })

  it('registers base commands (.r, .roll)', () => {
    registerWorkflowPlugins([])
    cleanup = initWorkflowSystem()

    expect(getCommand('.r')).toBeDefined()
    expect(getCommand('.roll')).toBeDefined()
  })

  it('is idempotent — second call returns no-op', () => {
    registerWorkflowPlugins([])
    cleanup = initWorkflowSystem()
    const cleanup2 = initWorkflowSystem()
    cleanup2() // should not throw
    cleanup()
  })

  it('dispatches new log entries to matching trigger workflows', async () => {
    let capturedVars: Record<string, unknown> | undefined

    const testPlugin: VTTPlugin = {
      id: 'test-trigger',
      onActivate(sdk) {
        sdk.defineWorkflow('test:on-text', (ctx) => {
          capturedVars = { ...ctx.vars }
        })
        sdk.registerTrigger({
          id: 'test-on-text',
          on: 'core:text',
          workflow: 'test:on-text',
          mapInput: (entry) => ({ content: entry.payload.content }),
          executeAs: 'triggering-executor',
        })
      },
    }

    registerWorkflowPlugins([testPlugin])
    cleanup = initWorkflowSystem()

    const entry = makeEntry({ seq: 1, executor: 'seat-a' })
    useWorldStore.setState((s) => ({
      logEntries: [...s.logEntries, entry],
      logEntriesById: { ...s.logEntriesById, [entry.id]: entry },
      logWatermark: entry.seq,
    }))

    await vi.waitFor(() => {
      expect(capturedVars).toBeDefined()
    })
    expect(capturedVars).toEqual({ content: 'hello' })
  })

  it('skips entries where executor does not match local seat', async () => {
    let triggered = false

    const testPlugin: VTTPlugin = {
      id: 'test-skip',
      onActivate(sdk) {
        sdk.defineWorkflow('test:should-skip', () => {
          triggered = true
        })
        sdk.registerTrigger({
          id: 'test-skip-t',
          on: 'core:text',
          workflow: 'test:should-skip',
          mapInput: (entry) => entry.payload,
          executeAs: 'triggering-executor',
        })
      },
    }

    registerWorkflowPlugins([testPlugin])
    cleanup = initWorkflowSystem()

    // Entry from seat-b, local is seat-a -> skip
    const entry = makeEntry({ seq: 1, executor: 'seat-b' })
    useWorldStore.setState((s) => ({
      logEntries: [...s.logEntries, entry],
      logEntriesById: { ...s.logEntriesById, [entry.id]: entry },
      logWatermark: entry.seq,
    }))

    await new Promise((r) => setTimeout(r, 50))
    expect(triggered).toBe(false)
  })

  it('cleanup unsubscribes — no dispatch after cleanup', async () => {
    let triggerCount = 0

    const testPlugin: VTTPlugin = {
      id: 'test-cleanup',
      onActivate(sdk) {
        sdk.defineWorkflow('test:count', () => {
          triggerCount++
        })
        sdk.registerTrigger({
          id: 'test-count-t',
          on: 'core:text',
          workflow: 'test:count',
          mapInput: (entry) => entry.payload,
          executeAs: 'triggering-executor',
        })
      },
    }

    registerWorkflowPlugins([testPlugin])
    cleanup = initWorkflowSystem()

    // First entry triggers
    const e1 = makeEntry({ seq: 1, id: 'e1' })
    useWorldStore.setState((s) => ({
      logEntries: [...s.logEntries, e1],
      logEntriesById: { ...s.logEntriesById, [e1.id]: e1 },
      logWatermark: 1,
    }))
    await vi.waitFor(() => {
      expect(triggerCount).toBe(1)
    })

    // Cleanup
    cleanup()

    // Second entry should NOT trigger
    const e2 = makeEntry({ seq: 2, id: 'e2' })
    useWorldStore.setState((s) => ({
      logEntries: [...s.logEntries, e2],
      logEntriesById: { ...s.logEntriesById, [e2.id]: e2 },
      logWatermark: 2,
    }))

    await new Promise((r) => setTimeout(r, 50))
    expect(triggerCount).toBe(1)
  })
})
