import { useMemo, useRef } from 'react'
import { WorkflowEngine } from './engine'
import { PluginSDK, WorkflowRunner } from './pluginSDK'
import { registerBaseWorkflows } from './baseWorkflows'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { eventBus } from '../events/eventBus'
import { getRulePluginSync } from '../rules/registry'
import type { VTTPlugin } from '../rules/types'
import type { IWorkflowRunner } from './types'
import type { PluginSDKDeps } from './pluginSDK'
import { clearCommands } from './commandRegistry'

// Re-export command registry functions for convenience
export { getCommand, registerCommand } from './commandRegistry'

// Singleton engine instance — initialized once
let _engine: WorkflowEngine | null = null
let _pluginsActivated = false
let _registeredPlugins: VTTPlugin[] = []

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
    getFormulaTokens: (entity) => getRulePluginSync().adapters.getFormulaTokens(entity),
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
