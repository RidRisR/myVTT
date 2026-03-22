import { useMemo, useRef } from 'react'
import { WorkflowEngine } from './engine'
import { PluginSDK, WorkflowRunner } from './pluginSDK'
import { UIRegistry } from '../ui-system/registry'
import { registerBaseWorkflows } from './baseWorkflows'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { useToast } from '../ui/useToast'
import { tokenizeExpression, toDiceSpecs } from '../shared/diceUtils'
import type { VTTPlugin } from '../rules/types'
import type { ToastType } from '../ui/Toast'
import type { IWorkflowRunner } from './types'
import type { PluginSDKDeps } from './pluginSDK'

// Singleton engine instance — initialized once
let _engine: WorkflowEngine | null = null
let _uiRegistry: UIRegistry | null = null
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

// Exported for production use — do NOT use in sandbox/tests.
// The sandbox creates its own isolated UIRegistry to avoid polluting this singleton
// (and to avoid double-registration if poc-ui is ever added to POC_PLUGINS).
export function getUIRegistry(): UIRegistry {
  if (!_uiRegistry) _uiRegistry = new UIRegistry()
  return _uiRegistry
}

// POC: hardcoded plugin list; real impl would discover from room's rule system
const POC_PLUGINS: VTTPlugin[] = [daggerheartCorePlugin, daggerheartCosmeticPlugin]

/** Reset engine — for testing only */
export function resetWorkflowEngine(): void {
  _engine = null
  _uiRegistry = null
  _pluginsActivated = false
  _registeredPlugins = []
}

/** Build the PluginSDKDeps from store actions. Shared between hook and init. */
function buildDeps(
  sendRoll: ReturnType<typeof useWorldStore.getState>['sendRoll'],
  updateEntity: ReturnType<typeof useWorldStore.getState>['updateEntity'],
  toastFn: (variant: ToastType, text: string, opts?: { duration?: number }) => void,
): PluginSDKDeps {
  return {
    sendRoll: async (formula: string) => {
      const stripped = formula.replace(/@[\p{L}\p{N}_]+/gu, '0')
      const terms = tokenizeExpression(stripped)
      const dice = terms ? toDiceSpecs(terms) : []
      const result = await sendRoll({
        dice,
        formula,
        resolvedFormula: stripped,
        senderId: '',
        senderName: '',
        senderColor: '',
      })
      const rolls: number[][] = result?.rolls ?? []
      const total = rolls.flat().reduce<number>((sum, v) => sum + v, 0)
      return { rolls, total }
    },
    updateEntity: (id, patch) => {
      void updateEntity(id, patch)
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
    sendMessage: (message) => {
      const seat = useIdentityStore.getState().getMySeat()
      void useWorldStore.getState().sendMessage({
        senderId: seat?.id ?? '',
        senderName: seat?.name ?? 'Unknown',
        senderColor: seat?.color ?? '#888888',
        content: message,
      })
    },
    showToast: (text, options) => {
      const variant = (options?.variant ?? 'info') as ToastType
      toastFn(variant, text, options?.durationMs ? { duration: options.durationMs } : undefined)
    },
  }
}

/** Build the PluginSDKDeps from store actions. Shared between hook and init. */
function buildDeps(
  sendRoll: ReturnType<typeof useWorldStore.getState>['sendRoll'],
  updateEntity: ReturnType<typeof useWorldStore.getState>['updateEntity'],
  toastFn: (variant: ToastType, text: string, opts?: { duration?: number }) => void,
): PluginSDKDeps {
  return {
    sendRoll: async (formula: string) => {
      const stripped = formula.replace(/@[\p{L}\p{N}_]+/gu, '0')
      const terms = tokenizeExpression(stripped)
      const dice = terms ? toDiceSpecs(terms) : []
      const result = await sendRoll({
        dice,
        formula,
        resolvedFormula: stripped,
        senderId: '',
        senderName: '',
        senderColor: '',
      })
      const rolls: number[][] = result?.rolls ?? []
      const total = rolls.flat().reduce<number>((sum, v) => sum + v, 0)
      return { rolls, total }
    },
    updateEntity: (id, patch) => {
      void updateEntity(id, patch)
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
    sendMessage: (message) => {
      const seat = useIdentityStore.getState().getMySeat()
      void useWorldStore.getState().sendMessage({
        senderId: seat?.id ?? '',
        senderName: seat?.name ?? 'Unknown',
        senderColor: seat?.color ?? '#888888',
        content: message,
      })
    },
    showToast: (text, options) => {
      const variant = (options?.variant ?? 'info') as ToastType
      toastFn(variant, text, options?.durationMs ? { duration: options.durationMs } : undefined)
    },
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
  const { toast } = useToast()

  const toastRef = useRef(toast)
  toastRef.current = toast

  // Side effect via ref guard — runs once, StrictMode safe (idempotent)
  const activatedRef = useRef(false)
  if (!activatedRef.current) {
    ensurePluginsActivated(getWorkflowEngine())
    activatedRef.current = true
  }

  return useMemo(() => {
    const engine = getWorkflowEngine()
    const deps = buildDeps(sendRoll, updateEntity, (v, t, o) => toastRef.current(v, t, o))
    return new WorkflowRunner(engine, deps)
  }, [sendRoll, updateEntity])
}

/**
 * @deprecated Use useWorkflowRunner() instead. This is kept for backward compatibility.
 */
export function useWorkflowSDK(): IWorkflowRunner {
  return useWorkflowRunner()
}
