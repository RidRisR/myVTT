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
  // Proxy delegates to a replaceable inner object. Snapshot/restore swaps _inner
  // in O(1) without delete — eliminates need for no-dynamic-delete suppress.
  let _inner: Record<string, unknown> = { ...initialData }

  const data = new Proxy({} as Record<string, unknown>, {
    get: (_, key): unknown => Reflect.get(_inner, key),
    set: (_, key, val): boolean => Reflect.set(_inner, key, val),
    deleteProperty: (_, key) => Reflect.deleteProperty(_inner, key),
    has: (_, key) => Reflect.has(_inner, key),
    ownKeys: () => Reflect.ownKeys(_inner),
    getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(_inner, key),
  })

  // Wire up dataCtrl so engine can snapshot/restore via Proxy inner swap
  internal.dataCtrl = {
    getInner: () => _inner,
    replaceInner: (replacement) => {
      _inner = replacement
    },
  }

  const ctx: WorkflowContext = {
    // getter-only: ctx.data = {} throws TypeError in strict mode,
    // but ctx.data.foo = 'bar' works (modifies Proxy → _inner)
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

    runWorkflow: <T extends Record<string, unknown> = Record<string, unknown>>(
      handle: WorkflowHandle<T>,
      nestedData?: Partial<T>,
    ): Promise<WorkflowResult<T>> => {
      // Nested workflow: inherit depth, independent abort + dataCtrl
      const nestedInternal: InternalState = {
        depth: internal.depth,
        abortCtrl: { aborted: false },
        dataCtrl: { getInner: () => ({}), replaceInner: () => {} }, // overwritten by nested createWorkflowContext
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
