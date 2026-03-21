import { useMemo, useRef } from 'react'
import { WorkflowEngine } from './engine'
import { PluginSDK } from './pluginSDK'
import { registerBaseWorkflows } from './baseWorkflows'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { useToast } from '../ui/useToast'
import { tokenizeExpression, toDiceSpecs } from '../shared/diceUtils'
import { daggerheartCorePlugin } from '../../plugins/daggerheart-core'
import { daggerheartCosmeticPlugin } from '../../plugins/daggerheart-cosmetic'
import type { VTTPlugin } from '../rules/types'
import type { PluginSDKDeps } from './pluginSDK'

// Singleton engine instance — initialized once
let _engine: WorkflowEngine | null = null
let _pluginsActivated = false

export function getWorkflowEngine(): WorkflowEngine {
  if (!_engine) {
    _engine = new WorkflowEngine()
    registerBaseWorkflows(_engine)
  }
  return _engine
}

// POC: hardcoded plugin list; real impl would discover from room's rule system
const POC_PLUGINS: VTTPlugin[] = [daggerheartCorePlugin, daggerheartCosmeticPlugin]

/** Reset engine — for testing only */
export function resetWorkflowEngine(): void {
  _engine = null
  _pluginsActivated = false
}

/**
 * React hook providing a PluginSDK instance connected to the global WorkflowEngine.
 * Uses worldStore actions as the base capability providers.
 */
export function useWorkflowSDK(): PluginSDK {
  const sendRoll = useWorldStore((s) => s.sendRoll)
  const updateEntity = useWorldStore((s) => s.updateEntity)
  const { toast } = useToast()

  // Use ref for toast to avoid useMemo dependency instability
  const toastRef = useRef(toast)
  toastRef.current = toast

  return useMemo(() => {
    const engine = getWorkflowEngine()
    const deps: PluginSDKDeps = {
      sendRoll: async (formula: string) => {
        // Strip @variable references so tokenizeExpression can parse dice notation
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
        // POC: flat sum of all dice; production needs full formula evaluation
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
        // patch.current is a delta (e.g. 1 means +1), convert to absolute value
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
        const variant = options?.variant ?? 'info'
        toastRef.current(variant, text, options?.durationMs ? { duration: options.durationMs } : undefined)
      },
    }
    const sdk = new PluginSDK(engine, deps)

    // Activate POC plugins once
    if (!_pluginsActivated) {
      for (const plugin of POC_PLUGINS) {
        plugin.onActivate(sdk)
      }
      _pluginsActivated = true

      // DEV: expose engine for console inspection
      // Usage: __wfEngine.inspectWorkflow('roll')
      if (import.meta.env.DEV) {
        ;(globalThis as Record<string, unknown>).__wfEngine = engine
      }
    }

    return sdk
  }, [sendRoll, updateEntity])
}
