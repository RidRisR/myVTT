import { useMemo, useRef } from 'react'
import { WorkflowEngine } from './engine'
import { PluginSDK, WorkflowRunner } from './pluginSDK'
import { registerBaseWorkflows } from './baseWorkflows'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import type { VTTPlugin } from '../rules/types'
import type { IWorkflowRunner } from './types'
import type { PluginSDKDeps } from './pluginSDK'
import { createWorkflowContext } from './context'
import { clearCommands } from './commandRegistry'
import { TriggerRegistry } from './triggerRegistry'
import { LogStreamDispatcher } from './logStreamDispatcher'
import { registerBaseRenderers } from '../log/registerBaseRenderers'
import { getUIRegistry } from '../ui-system/uiSystemInit'

// Re-export command registry functions for convenience
export { getCommand, registerCommand } from './commandRegistry'

// Singleton engine instance — initialized once
let _engine: WorkflowEngine | null = null
let _pluginsActivated = false
let _registeredPlugins: VTTPlugin[] = []
let _triggerRegistry: TriggerRegistry | null = null
let _runner: WorkflowRunner | null = null
let _dispatcher: LogStreamDispatcher | null = null
let _workflowSystemInitialized = false

// Lazy accessor for getRulePluginSync — breaks circular dependency with registry.ts.
// registry.ts imports registerWorkflowPlugins (from this file) at module level,
// so a static top-level import creates a TDZ error. This late-binding accessor
// is only called at runtime (inside buildDeps), after all modules are initialized.
type RulePlugin = import('../rules/types').RulePlugin
let _getRulePluginSyncFn: (() => RulePlugin) | null = null
function getRulePluginSyncLazy(): RulePlugin {
  if (!_getRulePluginSyncFn) {
    // Dynamically import at first use — by runtime all modules are fully initialized
    // so the circular reference is no longer a problem.
    throw new Error('getRulePluginSync not available — ensure _bindRuleRegistry() has been called')
  }
  return _getRulePluginSyncFn()
}

/**
 * Late-bind the rule registry reference. Called from registry.ts after its
 * module body has finished executing, breaking the circular init dependency.
 */
export function _bindRuleRegistry(fn: () => RulePlugin): void {
  _getRulePluginSyncFn = fn
}

/**
 * Register workflow plugins for activation. Must be called before useWorkflowRunner.
 * Designed to be called from the plugin registry boundary (src/rules/registry.ts).
 */
export function registerWorkflowPlugins(plugins: VTTPlugin[]): void {
  _registeredPlugins = plugins
}

export function getWorkflowEngine(): WorkflowEngine {
  if (!_engine) {
    _engine = new WorkflowEngine()
    registerBaseWorkflows(_engine)
  }
  return _engine
}

/** Reset engine — for testing only */
export function resetWorkflowEngine(): void {
  _engine = null
  _pluginsActivated = false
  _registeredPlugins = []
  _triggerRegistry = null
  _runner = null
  _dispatcher = null
  _workflowSystemInitialized = false
  clearCommands()
}

/** Build the PluginSDKDeps from store actions. */
function buildDeps(): PluginSDKDeps {
  return {
    emitEntry: (entry) => {
      const socket = useWorldStore.getState()._socket
      if (socket) socket.emit('log:entry', entry, () => {})
    },
    serverRoll: (request) => {
      const socket = useWorldStore.getState()._socket
      if (!socket) return Promise.reject(new Error('Socket not connected'))
      return new Promise((resolve, reject) => {
        socket.timeout(5000).emit('log:roll-request', request, (err, ack) => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- err is null on success despite Socket.io TS typing
          if (err) {
            reject(new Error('Roll request timed out'))
            return
          }
          if ('error' in ack) {
            reject(new Error(ack.error))
            return
          }
          resolve(ack.rolls)
        })
      })
    },
    createEntity: (data) => {
      const socket = useWorldStore.getState()._socket
      if (!socket) return Promise.reject(new Error('Socket not connected'))
      return new Promise((resolve, reject) => {
        socket.timeout(5000).emit('entity:create-request', data, (err, ack) => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- err is null on success despite Socket.io TS typing
          if (err) {
            reject(new Error('Entity create timed out'))
            return
          }
          if ('error' in ack) {
            reject(new Error(ack.error))
            return
          }
          resolve(ack.id)
        })
      })
    },
    deleteEntity: (entityId) => {
      const socket = useWorldStore.getState()._socket
      if (!socket) return Promise.reject(new Error('Socket not connected'))
      return new Promise((resolve, reject) => {
        socket.timeout(5000).emit('entity:delete-request', { id: entityId }, (err, ack) => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- err is null on success despite Socket.io TS typing
          if (err) {
            reject(new Error('Entity delete timed out'))
            return
          }
          if ('error' in ack) {
            reject(new Error(ack.error))
            return
          }
          resolve()
        })
      })
    },
    getEntity: (id: string) => {
      return useWorldStore.getState().entities[id]
    },
    getAllEntities: () => {
      return useWorldStore.getState().entities
    },
    getActiveOrigin: () => {
      const seat = useIdentityStore.getState().getMySeat()
      if (!seat) return { seat: { id: '', name: '', color: '' } }
      return { seat: { id: seat.id, name: seat.name, color: seat.color } }
    },
    getSeatId: () => useIdentityStore.getState().mySeatId ?? '',
    getLogWatermark: () => useWorldStore.getState().logWatermark,
    getFormulaTokens: (entity) => getRulePluginSyncLazy().adapters.getFormulaTokens(entity),
  }
}

/**
 * Activate registered plugins on the engine. Idempotent — only activates once per engine lifetime.
 * Uses plugins registered via registerWorkflowPlugins().
 */
function ensurePluginsActivated(engine: WorkflowEngine): void {
  if (_pluginsActivated) return

  for (const plugin of _registeredPlugins) {
    const sdk = new PluginSDK(engine, plugin.id)
    plugin.onActivate(sdk)
  }
  _pluginsActivated = true

  if (import.meta.env.DEV) {
    ;(globalThis as Record<string, unknown>).__wfEngine = engine
  }
}

/** Return type for initWorkflowSystem — sync construction only */
export interface WorkflowSystemHandle {
  /** Tear down the workflow system (engine, registries) */
  cleanup: () => void
}

/**
 * Phase 1: Construct the workflow system — engine, plugins (onActivate), runner, dispatcher.
 * Purely synchronous. Does NOT start listening for events or call onReady.
 *
 * Call `startWorkflowTriggers()` after stores are initialized to complete startup.
 */
export function initWorkflowSystem(): WorkflowSystemHandle {
  if (_workflowSystemInitialized) return { cleanup: () => {} }

  // Register base log entry renderers before plugin activation
  registerBaseRenderers()

  const engine = getWorkflowEngine()
  _triggerRegistry = new TriggerRegistry()

  // Activate plugins with trigger registry (declarations only — no runtime effects)
  if (!_pluginsActivated) {
    for (const plugin of _registeredPlugins) {
      const sdk = new PluginSDK(engine, plugin.id, getUIRegistry(), _triggerRegistry)
      plugin.onActivate(sdk)
    }
    _pluginsActivated = true

    if (import.meta.env.DEV) {
      ;(globalThis as Record<string, unknown>).__wfEngine = engine
    }
  }

  // Create runner + dispatcher (wired but not yet listening)
  const deps = buildDeps()
  _runner = new WorkflowRunner(engine, deps)
  _dispatcher = new LogStreamDispatcher({
    triggerRegistry: _triggerRegistry,
    runner: _runner,
    getSeatId: () => useIdentityStore.getState().mySeatId ?? '',
  })

  _workflowSystemInitialized = true
  return { cleanup: () => { /* engine/registry cleanup if needed */ } }
}

/**
 * Phase 2: Activate plugins at runtime and start trigger dispatch.
 * Must be called AFTER stores are initialized (entities, log history loaded).
 *
 * @param historyWatermark — the logWatermark captured immediately after store init.
 *   Entries with seq <= historyWatermark are considered historical and won't trigger.
 *   Entries that arrived between store init and this call are caught up automatically.
 *
 * Lifecycle:
 *   1. Run onReady for all plugins — plugins can read store state, create entities
 *   2. Catch up on any entries missed during the init window
 *   3. Subscribe dispatcher to log stream — triggers start firing
 *
 * Returns a cleanup function that unsubscribes the dispatcher.
 * Rejects if any plugin onReady fails (all are attempted via allSettled).
 */
export async function startWorkflowTriggers(historyWatermark: number): Promise<() => void> {
  if (!_workflowSystemInitialized) {
    throw new Error('startWorkflowTriggers called before initWorkflowSystem')
  }

  // ── Phase 2a: onReady ──
  // Plugins can now read real store state (entities, components, etc.)
  const readyDeps = buildDeps()
  const engine = getWorkflowEngine()
  const readyPromises: Promise<void>[] = []

  for (const plugin of _registeredPlugins) {
    if (plugin.onReady) {
      try {
        const readyInternal = { depth: 0, abortCtrl: { aborted: false } }
        const readyCtx = createWorkflowContext(
          { ...readyDeps, engine },
          {},
          readyInternal,
        )
        const result = plugin.onReady(readyCtx)
        if (result && typeof (result as Promise<void>).then === 'function') {
          readyPromises.push(
            (result as Promise<void>).catch((err: unknown) => {
              throw new Error(
                `Plugin "${plugin.id}" onReady failed: ${err instanceof Error ? err.message : String(err)}`,
              )
            }),
          )
        }
      } catch (err) {
        readyPromises.push(
          Promise.reject(
            new Error(
              `Plugin "${plugin.id}" onReady failed: ${err instanceof Error ? err.message : String(err)}`,
            ),
          ),
        )
      }
    }
  }

  // Settle all — report all failures, not just the first
  const results = await Promise.allSettled(readyPromises)
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  )
  if (failures.length > 0) {
    for (const f of failures) {
      console.error('[WorkflowSystem]', f.reason)
    }
  }

  // ── Phase 2b: Catch up + subscribe dispatcher to log stream ──
  const dispatcher = _dispatcher!

  // Set cursor to history boundary — entries at or below this seq are historical
  dispatcher.startFrom(historyWatermark)

  // Catch up on entries that arrived between store init and now (the init window).
  // Safe to pass the full store — dispatcher's cursor skips historical entries.
  dispatcher.catchUp(useWorldStore.getState().logEntries)

  // Subscribe to future entries. Dispatcher's internal cursor handles idempotency,
  // so no watermarkOverride is needed.
  const unsubscribe = useWorldStore.subscribe((state, prevState) => {
    if (state.logEntries.length > prevState.logEntries.length) {
      for (let i = prevState.logEntries.length; i < state.logEntries.length; i++) {
        const entry = state.logEntries[i]
        if (entry) void dispatcher.dispatch(entry)
      }
    }
  })

  // If onReady had failures, throw after subscribing (so triggers still work)
  if (failures.length > 0) {
    const err = new AggregateError(
      failures.map((f) => f.reason as Error),
      `${failures.length} plugin(s) failed onReady`,
    )
    ;(err as AggregateError & { cleanup: () => void }).cleanup = unsubscribe
    throw err
  }

  return unsubscribe
}

/**
 * React hook providing a WorkflowRunner for the UI layer.
 * Plugin activation runs once via ref guard (not inside useMemo).
 */
export function useWorkflowRunner(): IWorkflowRunner {
  // Side effect via ref guard — runs once, StrictMode safe (idempotent)
  const activatedRef = useRef(false)
  if (!activatedRef.current) {
    ensurePluginsActivated(getWorkflowEngine())
    activatedRef.current = true
  }

  return useMemo(() => {
    const engine = getWorkflowEngine()
    const deps = buildDeps()
    return new WorkflowRunner(engine, deps)
  }, [])
}
