import { useMemo } from 'react'
import { WorkflowEngine } from './engine'
import { PluginSDK } from './pluginSDK'
import { registerBaseWorkflows } from './baseWorkflows'
import { useWorldStore } from '../stores/worldStore'
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
}

/**
 * React hook providing a PluginSDK instance connected to the global WorkflowEngine.
 * Uses worldStore actions as the base capability providers.
 */
export function useWorkflowSDK(): PluginSDK {
  const sendRoll = useWorldStore((s) => s.sendRoll)
  const updateEntity = useWorldStore((s) => s.updateEntity)

  return useMemo(() => {
    const engine = getWorkflowEngine()
    const deps: PluginSDKDeps = {
      sendRoll: async (formula: string) => {
        // Strip @variable references so tokenizeExpression can parse dice notation
        const stripped = formula.replace(/@[\p{L}\p{N}_]+/gu, '0')
        const terms = tokenizeExpression(stripped)
        const dice = terms ? toDiceSpecs(terms) : []
        await sendRoll({
          dice,
          formula,
          resolvedFormula: stripped,
          senderId: '',
          senderName: '',
          senderColor: '',
        })
        // POC: sendRoll returns void, server broadcasts result via socket
        return { rolls: [[]], total: 0 }
      },
      updateEntity: (id, patch) => {
        void updateEntity(id, patch)
      },
      updateTeamTracker: (_label, _patch) => {
        // POC stub — real impl finds tracker by label then calls store action
      },
      sendMessage: (_message) => {
        // POC stub
      },
      showToast: (_text, _options) => {
        // POC stub
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
