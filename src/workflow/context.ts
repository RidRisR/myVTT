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
import { requestInput as sessionRequestInput } from '../stores/sessionStore'

export interface ContextDeps {
  sendRoll: (formula: string) => Promise<{ rolls: number[][]; total: number }>
  updateEntity: (id: string, patch: Partial<Entity>) => void
  updateTeamTracker: (label: string, patch: { current?: number }) => void
  getEntity: (id: string) => Entity | undefined
  getAllEntities: () => Record<string, Entity>
  eventBus: EventBus
  engine: WorkflowEngine
}

export interface ContextOptions {
  readonly?: boolean // true = vars frozen via Proxy (set/delete throw)
}

export function createWorkflowContext(
  deps: ContextDeps,
  initialData: Record<string, unknown> = {},
  internal: InternalState,
  options?: ContextOptions,
): WorkflowContext {
  const _inner: Record<string, unknown> = { ...initialData }

  const state = options?.readonly
    ? new Proxy(_inner, {
        get: (target, key): unknown => Reflect.get(target, key),
        set: () => {
          throw new TypeError('Cannot modify vars in a readonly step')
        },
        deleteProperty: () => {
          throw new TypeError('Cannot modify vars in a readonly step')
        },
        has: (target, key) => Reflect.has(target, key),
        ownKeys: (target) => Reflect.ownKeys(target),
        getOwnPropertyDescriptor: (target, key) => Reflect.getOwnPropertyDescriptor(target, key),
      })
    : new Proxy({} as Record<string, unknown>, {
        get: (_, key): unknown => Reflect.get(_inner, key),
        set: (_, key, val): boolean => Reflect.set(_inner, key, val),
        deleteProperty: (_, key) => Reflect.deleteProperty(_inner, key),
        has: (_, key) => Reflect.has(_inner, key),
        ownKeys: () => Reflect.ownKeys(_inner),
        getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(_inner, key),
      })

  // Imperative data reader backed by deps.getEntity
  const read: IDataReader = {
    entity: (id: string) => deps.getEntity(id),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T required for caller type inference
    component: <T>(entityId: string, key: string): T | undefined => {
      const entity = deps.getEntity(entityId)
      if (!entity) return undefined
      return entity.components[key] as T | undefined
    },
    query: (spec: { has?: string[] }): Entity[] => {
      const entities = Object.values(deps.getAllEntities())
      const keys = spec.has
      if (!keys || keys.length === 0) return entities
      return entities.filter((e) => keys.every((key) => key in e.components))
    },
  }

  const ctx: WorkflowContext = {
    // getter-only: ctx.vars = {} throws TypeError in strict mode,
    // but ctx.vars.foo = 'bar' works (modifies Proxy → _inner)
    get vars() {
      return state
    },

    // ── Data access ─────────────────────────────────────────────────────────
    read,

    // ── Input (returns value, suspends execution) ────────────────────────
    serverRoll: (formula: string) => deps.sendRoll(formula),
    requestInput: (interactionId: string) => sessionRequestInput(interactionId),

    // ── Effects (side effects) ────────────────────────────────────────────
    updateComponent: <T>(
      entityId: string,
      key: string,
      updater: (current: T | undefined) => T,
    ): void => {
      const entity = deps.getEntity(entityId)
      const current = entity?.components[key] as T | undefined
      const next = updater(current)
      deps.updateEntity(entityId, {
        components: { ...entity?.components, [key]: next },
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

    runWorkflow: <T extends Record<string, unknown> = Record<string, unknown>, TOut = T>(
      handle: WorkflowHandle<T, TOut>,
      nestedData?: Partial<T>,
    ): Promise<WorkflowResult<T, TOut>> => {
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
        WorkflowResult<T, TOut>
      >
    },
  }

  return ctx
}
