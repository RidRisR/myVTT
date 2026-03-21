import { useMemo } from 'react'
import { WorkflowEngine } from './engine'
import { PluginSDK } from './pluginSDK'
import { registerBaseWorkflows } from './baseWorkflows'
import { useWorldStore } from '../stores/worldStore'
import type { PluginSDKDeps } from './pluginSDK'

// Singleton engine instance — initialized once
let _engine: WorkflowEngine | null = null

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
        // POC: sendRoll currently posts to server and returns void.
        // Real impl needs server to return roll results synchronously.
        // For POC, we call the endpoint. The return value won't be usable yet.
        await sendRoll({
          dice: [],
          formula,
          resolvedFormula: formula,
          senderId: '',
          senderName: '',
          senderColor: '',
        })
        // POC fallback: return empty result since sendRoll returns void
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
    return new PluginSDK(engine, deps)
  }, [sendRoll, updateEntity])
}
