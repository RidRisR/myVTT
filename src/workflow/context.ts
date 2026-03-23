// src/workflow/context.ts
import type {
  WorkflowContext,
  IDataReader,
  InternalState,
  WorkflowHandle,
  WorkflowResult,
} from './types'
import type { Entity } from '../shared/entityTypes'
import type { WorkflowEngine } from './engine'
import type { EventBus } from '../events/eventBus'

export interface ContextDeps {
  sendRoll: (formula: string) => Promise<{ rolls: number[][]; total: number }>
  updateEntity: (id: string, patch: Partial<Entity>) => void
  updateTeamTracker: (label: string, patch: { current?: number }) => void
  getEntity: (id: string) => Entity | undefined
  eventBus: EventBus
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

  const state = new Proxy({} as Record<string, unknown>, {
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

  // Imperative data reader — Phase 3 will provide a full implementation,
  // this is a temporary version backed by deps.getEntity
  const read: IDataReader = {
    entity: (id: string) => deps.getEntity(id),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T required for caller type inference
    component: <T>(entityId: string, key: string): T | undefined => {
      const entity = deps.getEntity(entityId)
      if (!entity) return undefined
      return (entity.ruleData as Record<string, unknown> | undefined)?.[key] as T | undefined
    },
    query: (spec: { has?: string[] }) => {
      // Minimal placeholder — Phase 3 provides full implementation via worldStore
      void spec
      return []
    },
  }

  const ctx: WorkflowContext = {
    // getter-only: ctx.state = {} throws TypeError in strict mode,
    // but ctx.state.foo = 'bar' works (modifies Proxy → _inner)
    get state() {
      return state
    },

    // ── Data access ─────────────────────────────────────────────────────────
    read,

    // ── Input (returns value) ─────────────────────────────────────────────
    serverRoll: (formula: string) => deps.sendRoll(formula),

    // ── Effects (side effects) ────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T required for caller type inference
    updateComponent: <T>(
      entityId: string,
      key: string,
      updater: (current: T | undefined) => T,
    ): void => {
      // Temporary implementation: writes to ruleData[key].
      // Phase 4 will replace with entity.components[key] + REST PATCH.
      const entity = deps.getEntity(entityId)
      const ruleData = (entity?.ruleData as Record<string, unknown> | null) ?? {}
      const current = ruleData[key] as T | undefined
      const next = updater(current)
      deps.updateEntity(entityId, {
        ruleData: { ...ruleData, [key]: next },
      })
    },

    updateTeamTracker: (label: string, patch: { current?: number }) => {
      deps.updateTeamTracker(label, patch)
    },

    // ── Events (decoupled side effects via EventBus) ─────────────────────
    events: {
      emit: <T>(handle: { key: string; __type?: T }, payload: T): void => {
        deps.eventBus.emit(handle, payload)
      },
    },

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
