import { useMemo, useRef } from 'react'
import { WorkflowEngine } from './engine'
import { PluginSDK, WorkflowRunner } from './pluginSDK'
import { registerBaseWorkflows } from './baseWorkflows'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { eventBus } from '../events/eventBus'
import type { VTTPlugin } from '../rules/types'
import type { IWorkflowRunner } from './types'
import type { PluginSDKDeps } from './pluginSDK'
import { clearCommands } from './commandRegistry'
import { TriggerRegistry } from './triggerRegistry'
import { LogStreamDispatcher } from './logStreamDispatcher'
import { getUIRegistry, getExtensionRegistry } from '../ui-system/uiSystemInit'

// Re-export command registry functions for convenience
export { getCommand, registerCommand } from './commandRegistry'

// Singleton engine instance — initialized once
let _engine: WorkflowEngine | null = null
let _pluginsActivated = false
let _registeredPlugins: VTTPlugin[] = []
let _triggerRegistry: TriggerRegistry | null = null
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
          resolve(ack)
        })
      })
    },
    getEntity: (id: string) => {
      return useWorldStore.getState().entities[id]
    },
    getAllEntities: () => {
      return useWorldStore.getState().entities
    },
    eventBus,
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

/**
 * Initialize the entire workflow system: engine, plugins, triggers, dispatcher.
 * Synchronous — all structures are pure construction with lazy getters.
 * Must be called BEFORE store init (Promise.all) to ensure dispatcher
 * exists before the first log:new event arrives.
 */
export function initWorkflowSystem(): () => void {
  if (_workflowSystemInitialized) return () => {}

  const engine = getWorkflowEngine()
  _triggerRegistry = new TriggerRegistry()

  // Activate plugins with trigger registry
  if (!_pluginsActivated) {
    for (const plugin of _registeredPlugins) {
      const sdk = new PluginSDK(
        engine,
        plugin.id,
        getUIRegistry(),
        _triggerRegistry,
        getExtensionRegistry(),
      )
      plugin.onActivate(sdk)
    }
    _pluginsActivated = true

    if (import.meta.env.DEV) {
      ;(globalThis as Record<string, unknown>).__wfEngine = engine
    }
  }

  // Create runner + dispatcher with lazy getters
  const deps = buildDeps()
  const runner = new WorkflowRunner(engine, deps)
  const dispatcher = new LogStreamDispatcher({
    triggerRegistry: _triggerRegistry,
    runner,
    getSeatId: () => useIdentityStore.getState().mySeatId ?? '',
    getWatermark: () => useWorldStore.getState().logWatermark,
  })

  // Subscribe to log stream — dispatch new entries as they arrive.
  // We pass prevState.logWatermark as the "watermark at dispatch time" so the
  // dispatcher can correctly distinguish new entries from historical ones,
  // even when the store's watermark is updated in the same setState batch.
  const unsubscribe = useWorldStore.subscribe((state, prevState) => {
    if (state.logEntries.length > prevState.logEntries.length) {
      const prevWatermark = prevState.logWatermark
      for (let i = prevState.logEntries.length; i < state.logEntries.length; i++) {
        const entry = state.logEntries[i]
        if (entry) void dispatcher.dispatch(entry, prevWatermark)
      }
    }
  })

  _workflowSystemInitialized = true
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
