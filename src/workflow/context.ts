// src/workflow/context.ts
import type { WorkflowContext, AnimationSpec, ToastOptions } from './types'
import type { Entity } from '../shared/entityTypes'
import type { WorkflowEngine } from './engine'

export interface ContextDeps {
  sendRoll: (formula: string) => Promise<{ rolls: number[][]; total: number }>
  updateEntity: (id: string, patch: Partial<Entity>) => void
  updateTeamTracker: (label: string, patch: { current?: number }) => void
  sendMessage: (message: string) => void
  showToast: (text: string, options?: ToastOptions) => void
  engine: WorkflowEngine
}

export function createWorkflowContext(
  deps: ContextDeps,
  initialData: Record<string, unknown> = {},
): WorkflowContext {
  const ctx: WorkflowContext = {
    data: { ...initialData },

    serverRoll: (formula: string) => deps.sendRoll(formula),

    updateEntity: (entityId: string, patch: Partial<Entity>) => {
      deps.updateEntity(entityId, patch)
    },

    updateTeamTracker: (label: string, patch: { current?: number }) => {
      deps.updateTeamTracker(label, patch)
    },

    announce: (message: string) => {
      deps.sendMessage(message)
    },

    showToast: (text: string, options?: ToastOptions) => {
      deps.showToast(text, options)
    },

    // no-op stubs for POC
    playAnimation: (_animation: AnimationSpec) => Promise.resolve(),
    playSound: (_sound: string) => {},

    // no-op stub — engine patches this in runWorkflow
    abort: (_reason?: string) => {},

    // Creates a nested context and delegates to engine
    runWorkflow: (name: string, data?: Record<string, unknown>) => {
      const nestedCtx = createWorkflowContext(deps, data)
      return deps.engine.runWorkflow(name, nestedCtx)
    },
  }

  return ctx
}
