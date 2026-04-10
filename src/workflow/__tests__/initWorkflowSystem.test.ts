import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resetWorkflowEngine,
  registerWorkflowPlugins,
  initWorkflowSystem,
  startWorkflowTriggers,
  getCommand,
} from '../useWorkflowSDK'
import type { WorkflowSystemHandle } from '../useWorkflowSDK'
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
  let handle: WorkflowSystemHandle
  let cleanupTriggers: (() => void) | undefined

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
    cleanupTriggers?.()
    cleanupTriggers = undefined
    handle?.cleanup()
    resetWorkflowEngine()
  })

  it('registers base commands (.r, .roll)', () => {
    registerWorkflowPlugins([])
    handle = initWorkflowSystem()

    expect(getCommand('.r')).toBeDefined()
    expect(getCommand('.roll')).toBeDefined()
  })

  it('is idempotent — second call returns no-op', () => {
    registerWorkflowPlugins([])
    handle = initWorkflowSystem()
    const handle2 = initWorkflowSystem()
    handle2.cleanup() // should not throw
    handle.cleanup()
  })

  it('dispatches new log entries to matching trigger workflows', async () => {
    let capturedVars: Record<string, unknown> | undefined

    const testPlugin: VTTPlugin = {
      id: 'test-trigger',
      onActivate(sdk) {
        sdk.defineWorkflow('test-trigger:on-text', (ctx) => {
          capturedVars = { ...ctx.vars }
        })
        sdk.registerTrigger({
          id: 'test-trigger:on-text',
          on: 'core:text',
          workflow: 'test-trigger:on-text',
          mapInput: (entry) => ({ content: entry.payload.content }),
          executeAs: 'triggering-executor',
        })
      },
    }

    registerWorkflowPlugins([testPlugin])
    handle = initWorkflowSystem()
    cleanupTriggers = await startWorkflowTriggers(0)

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
        sdk.defineWorkflow('test-skip:should-skip', () => {
          triggered = true
        })
        sdk.registerTrigger({
          id: 'test-skip:trigger',
          on: 'core:text',
          workflow: 'test-skip:should-skip',
          mapInput: (entry) => entry.payload,
          executeAs: 'triggering-executor',
        })
      },
    }

    registerWorkflowPlugins([testPlugin])
    handle = initWorkflowSystem()
    cleanupTriggers = await startWorkflowTriggers(0)

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
        sdk.defineWorkflow('test-cleanup:count', () => {
          triggerCount++
        })
        sdk.registerTrigger({
          id: 'test-cleanup:trigger',
          on: 'core:text',
          workflow: 'test-cleanup:count',
          mapInput: (entry) => entry.payload,
          executeAs: 'triggering-executor',
        })
      },
    }

    registerWorkflowPlugins([testPlugin])
    handle = initWorkflowSystem()
    cleanupTriggers = await startWorkflowTriggers(0)

    const e1 = makeEntry({ seq: 1, id: 'e1' })
    useWorldStore.setState((s) => ({
      logEntries: [...s.logEntries, e1],
      logEntriesById: { ...s.logEntriesById, [e1.id]: e1 },
      logWatermark: 1,
    }))
    await vi.waitFor(() => {
      expect(triggerCount).toBe(1)
    })

    cleanupTriggers()
    cleanupTriggers = undefined

    const e2 = makeEntry({ seq: 2, id: 'e2' })
    useWorldStore.setState((s) => ({
      logEntries: [...s.logEntries, e2],
      logEntriesById: { ...s.logEntriesById, [e2.id]: e2 },
      logWatermark: 2,
    }))

    await new Promise((r) => setTimeout(r, 50))
    expect(triggerCount).toBe(1)
  })

  it('throws if startWorkflowTriggers called before initWorkflowSystem', async () => {
    await expect(startWorkflowTriggers(0)).rejects.toThrow(
      'startWorkflowTriggers called before initWorkflowSystem',
    )
  })

  it('catches up entries from the init window via dispatcher cursor', async () => {
    let capturedVars: Record<string, unknown> | undefined

    const testPlugin: VTTPlugin = {
      id: 'test-catchup',
      onActivate(sdk) {
        sdk.defineWorkflow('test-catchup:on-text', (ctx) => {
          capturedVars = { ...ctx.vars }
        })
        sdk.registerTrigger({
          id: 'test-catchup:trigger',
          on: 'core:text',
          workflow: 'test-catchup:on-text',
          mapInput: (entry) => ({ content: entry.payload.content }),
          executeAs: 'triggering-executor',
        })
      },
    }

    registerWorkflowPlugins([testPlugin])
    handle = initWorkflowSystem()

    // Simulate: entry arrives between store init and startWorkflowTriggers
    const entry = makeEntry({ seq: 5, id: 'window-entry' })
    useWorldStore.setState((s) => ({
      logEntries: [...s.logEntries, entry],
      logEntriesById: { ...s.logEntriesById, [entry.id]: entry },
      logWatermark: 5,
    }))

    // historyWatermark was 0 (captured before the window entry arrived)
    cleanupTriggers = await startWorkflowTriggers(0)

    // catchUp should have dispatched the window entry
    await vi.waitFor(() => {
      expect(capturedVars).toBeDefined()
    })
    expect(capturedVars).toEqual({ content: 'hello' })
  })

  describe('ruleSystemId filtering', () => {
    it('skips plugins with non-matching ruleSystemId', () => {
      const callOrder: string[] = []

      const dhPlugin: VTTPlugin = {
        id: 'dh',
        ruleSystemId: 'daggerheart',
        onActivate() {
          callOrder.push('activate-dh')
        },
      }

      const genericPlugin: VTTPlugin = {
        id: 'gen',
        ruleSystemId: 'generic',
        onActivate() {
          callOrder.push('activate-gen')
        },
      }

      const corePlugin: VTTPlugin = {
        id: 'core',
        onActivate() {
          callOrder.push('activate-core')
        },
      }

      registerWorkflowPlugins([dhPlugin, genericPlugin, corePlugin])
      handle = initWorkflowSystem('generic')

      // Only generic + rule-agnostic core should activate; daggerheart should be skipped
      expect(callOrder).toEqual(['activate-gen', 'activate-core'])
    })

    it('activates matching ruleSystemId plugins', () => {
      const callOrder: string[] = []

      const dhPlugin: VTTPlugin = {
        id: 'dh',
        ruleSystemId: 'daggerheart',
        onActivate() {
          callOrder.push('activate-dh')
        },
      }

      const corePlugin: VTTPlugin = {
        id: 'core',
        onActivate() {
          callOrder.push('activate-core')
        },
      }

      registerWorkflowPlugins([dhPlugin, corePlugin])
      handle = initWorkflowSystem('daggerheart')

      expect(callOrder).toEqual(['activate-dh', 'activate-core'])
    })

    it('activates all plugins when no ruleSystemId is passed', () => {
      const callOrder: string[] = []

      const dhPlugin: VTTPlugin = {
        id: 'dh',
        ruleSystemId: 'daggerheart',
        onActivate() {
          callOrder.push('activate-dh')
        },
      }

      const genericPlugin: VTTPlugin = {
        id: 'gen',
        ruleSystemId: 'generic',
        onActivate() {
          callOrder.push('activate-gen')
        },
      }

      registerWorkflowPlugins([dhPlugin, genericPlugin])
      handle = initWorkflowSystem()

      expect(callOrder).toEqual(['activate-dh', 'activate-gen'])
    })

    it('skips onReady for non-matching plugins', async () => {
      const callOrder: string[] = []

      const dhPlugin: VTTPlugin = {
        id: 'dh',
        ruleSystemId: 'daggerheart',
        onActivate() {
          callOrder.push('activate-dh')
        },
        onReady() {
          callOrder.push('ready-dh')
        },
      }

      const corePlugin: VTTPlugin = {
        id: 'core',
        onActivate() {
          callOrder.push('activate-core')
        },
        onReady() {
          callOrder.push('ready-core')
        },
      }

      registerWorkflowPlugins([dhPlugin, corePlugin])
      handle = initWorkflowSystem('generic')
      cleanupTriggers = await startWorkflowTriggers(0)

      // dh should be completely skipped (no activate, no ready)
      expect(callOrder).toEqual(['activate-core', 'ready-core'])
    })
  })

  it('does not trigger on historical entries below historyWatermark', async () => {
    let triggered = false

    const testPlugin: VTTPlugin = {
      id: 'test-history',
      onActivate(sdk) {
        sdk.defineWorkflow('test-history:on-text', () => {
          triggered = true
        })
        sdk.registerTrigger({
          id: 'test-history:trigger',
          on: 'core:text',
          workflow: 'test-history:on-text',
          mapInput: (entry) => entry.payload,
          executeAs: 'triggering-executor',
        })
      },
    }

    registerWorkflowPlugins([testPlugin])
    handle = initWorkflowSystem()

    // Store has historical entries (seq 1-5)
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ seq: i + 1, id: `hist-${i + 1}` }),
    )
    useWorldStore.setState({
      logEntries: entries,
      logEntriesById: Object.fromEntries(entries.map((e) => [e.id, e])),
      logWatermark: 5,
    })

    // historyWatermark = 5 → all entries are historical
    cleanupTriggers = await startWorkflowTriggers(5)

    await new Promise((r) => setTimeout(r, 50))
    expect(triggered).toBe(false)
  })
})
