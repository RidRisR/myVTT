import { useMemo, useRef } from 'react'
import { WorkflowEngine } from './engine'
import { PluginSDK, WorkflowRunner } from './pluginSDK'
import { registerBaseWorkflows } from './baseWorkflows'
import { useWorldStore } from '../stores/worldStore'
import { tokenizeExpression, toDiceSpecs } from '../shared/diceUtils'
import { eventBus } from '../events/eventBus'
import type { VTTPlugin } from '../rules/types'
import type { IWorkflowRunner } from './types'
import type { PluginSDKDeps } from './pluginSDK'

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
}

/** Build the PluginSDKDeps from store actions. */
function buildDeps(
  sendRoll: ReturnType<typeof useWorldStore.getState>['sendRoll'],
  updateEntity: ReturnType<typeof useWorldStore.getState>['updateEntity'],
): PluginSDKDeps {
  return {
    sendRoll: async (formula: string) => {
      const stripped = formula.replace(/@[\p{L}\p{N}_]+/gu, '0')
      const terms = tokenizeExpression(stripped)
      const dice = terms ? toDiceSpecs(terms) : []
      const result = await sendRoll({
        origin: { seat: { id: '', name: '', color: '' } },
        dice,
        formula,
        resolvedFormula: stripped,
      })
      const rolls: number[][] = result?.rolls ?? []
      const total = rolls.flat().reduce<number>((sum, v) => sum + v, 0)
      return { rolls, total }
    },
    updateEntity: (id, patch) => {
      void updateEntity(id, patch)
    },
    getEntity: (id: string) => {
      return useWorldStore.getState().entities[id]
    },
    getAllEntities: () => {
      return useWorldStore.getState().entities
    },
    updateTeamTracker: (label, patch) => {
      const state = useWorldStore.getState()
      const tracker = state.teamTrackers.find((t) => t.label === label)
      if (!tracker) return
      const updates = {
        ...patch,
        ...(patch.current != null ? { current: tracker.current + patch.current } : {}),
      }
      void state.updateTeamTracker(tracker.id, updates)
    },
    eventBus,
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
  const sendRoll = useWorldStore((s) => s.sendRoll)
  const updateEntity = useWorldStore((s) => s.updateEntity)

  // Side effect via ref guard — runs once, StrictMode safe (idempotent)
  const activatedRef = useRef(false)
  if (!activatedRef.current) {
    ensurePluginsActivated(getWorkflowEngine())
    activatedRef.current = true
  }

  return useMemo(() => {
    const engine = getWorkflowEngine()
    const deps = buildDeps(sendRoll, updateEntity)
    return new WorkflowRunner(engine, deps)
  }, [sendRoll, updateEntity])
}
