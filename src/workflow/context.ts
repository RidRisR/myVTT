// src/workflow/context.ts
import type {
  WorkflowContext,
  AnimationSpec,
  ToastOptions,
  InternalState,
  WorkflowHandle,
  WorkflowResult,
} from './types'
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
  internal: InternalState,
): WorkflowContext {
  const data: Record<string, unknown> = { ...initialData }

  const ctx: WorkflowContext = {
    // getter-only: ctx.data = {} throws TypeError in strict mode,
    // but ctx.data.foo = 'bar' works (modifies property, not reference)
    get data() {
      return data
    },

    // ── Input (returns value) ─────────────────────────────────────────────
    serverRoll: (formula: string) => deps.sendRoll(formula),

    // ── Effects (side effects) ────────────────────────────────────────────
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

    playAnimation: (_animation: AnimationSpec) => Promise.resolve(),
    playSound: (_sound: string) => {},

    // ── Flow Control ──────────────────────────────────────────────────────
    abort: (reason?: string) => {
      internal.abortCtrl.aborted = true
      internal.abortCtrl.reason = reason
    },

    runWorkflow: <T = Record<string, unknown>>(
      handle: WorkflowHandle<T>,
      nestedData?: Partial<T>,
    ): Promise<WorkflowResult<T>> => {
      // Nested workflow: inherit depth, independent abort
      const nestedInternal: InternalState = {
        depth: internal.depth,
        abortCtrl: { aborted: false },
      }
      const nestedCtx = createWorkflowContext(
        deps,
        (nestedData ?? {}) as Record<string, unknown>,
        nestedInternal,
      )
      return deps.engine.runWorkflow(handle.name, nestedCtx, nestedInternal) as Promise<
        WorkflowResult<T>
      >
    },
  }

  return ctx
}
