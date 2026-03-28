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
import type { GameLogEntry, LogEntrySubmission, RollRequest, Visibility } from '../shared/logTypes'
import type { MessageOrigin } from '../shared/chatTypes'
import type { DiceSpec } from '../shared/diceUtils'
import { uuidv7 } from '../shared/uuidv7'
import { requestInput as sessionRequestInput } from '../stores/sessionStore'

export interface ContextDeps {
  emitEntry: (entry: LogEntrySubmission) => void
  serverRoll: (request: RollRequest) => Promise<GameLogEntry>
  getEntity: (id: string) => Entity | undefined
  getAllEntities: () => Record<string, Entity>
  eventBus: EventBus
  engine: WorkflowEngine
  getActiveOrigin: () => MessageOrigin
  getSeatId: () => string
  getLogWatermark: () => number
  getFormulaTokens: (entity: Entity) => Record<string, number>
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
    component: ((entityId: string, key: string) => {
      const entity = deps.getEntity(entityId)
      if (!entity) return undefined
      return entity.components[key]
    }) as IDataReader['component'],
    query: (spec: { has?: string[] }): Entity[] => {
      const entities = Object.values(deps.getAllEntities())
      const keys = spec.has
      if (!keys || keys.length === 0) return entities
      return entities.filter((e) => keys.every((key) => key in e.components))
    },
    formulaTokens: (entityId: string): Record<string, number> => {
      const entity = deps.getEntity(entityId)
      if (!entity) return {}
      return deps.getFormulaTokens(entity)
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
    serverRoll: async (
      formula: string,
      options?: {
        dice?: DiceSpec[]
        resolvedFormula?: string
        rollType?: string
        actionName?: string
        parentId?: string
        chainDepth?: number
        triggerable?: boolean
        visibility?: Visibility
      },
    ) => {
      const request: RollRequest = {
        origin: deps.getActiveOrigin(),
        parentId: options?.parentId,
        chainDepth: options?.chainDepth ?? 0,
        triggerable: options?.triggerable ?? true,
        visibility: options?.visibility ?? {},
        dice: options?.dice ?? [{ sides: 6, count: 1 }], // fallback if not provided
        formula,
        resolvedFormula: options?.resolvedFormula,
        rollType: options?.rollType,
        actionName: options?.actionName,
      }
      return deps.serverRoll(request)
    },
    requestInput: (interactionId: string) => sessionRequestInput(interactionId),

    // ── Effects (side effects) ────────────────────────────────────────────
    emitEntry: ((partial: {
      type: string
      payload: Record<string, unknown>
      triggerable: boolean
      parentId?: string
      chainDepth?: number
      visibility?: Visibility
    }) => {
      const submission: LogEntrySubmission = {
        id: uuidv7(),
        type: partial.type,
        origin: deps.getActiveOrigin(),
        parentId: partial.parentId,
        chainDepth: partial.chainDepth ?? 0,
        triggerable: partial.triggerable,
        visibility: partial.visibility ?? {},
        baseSeq: deps.getLogWatermark(),
        payload: partial.payload,
        timestamp: Date.now(),
      }
      deps.emitEntry(submission)
    }) as WorkflowContext['emitEntry'],

    updateComponent: ((
      entityId: string,
      key: string,
      updater: (current: unknown) => unknown,
    ): void => {
      const entity = deps.getEntity(entityId)
      const current = entity?.components[key]
      const next = updater(current)
      const submission: LogEntrySubmission = {
        id: uuidv7(),
        type: 'core:component-update',
        origin: deps.getActiveOrigin(),
        chainDepth: 0,
        triggerable: false,
        visibility: {},
        baseSeq: deps.getLogWatermark(),
        payload: { entityId, key, data: next },
        timestamp: Date.now(),
      }
      deps.emitEntry(submission)
    }) as WorkflowContext['updateComponent'],

    updateTeamTracker: (label: string, patch: { current?: number }) => {
      const submission: LogEntrySubmission = {
        id: uuidv7(),
        type: 'core:tracker-update',
        origin: deps.getActiveOrigin(),
        chainDepth: 0,
        triggerable: false,
        visibility: {},
        baseSeq: deps.getLogWatermark(),
        payload: { label, ...patch },
        timestamp: Date.now(),
      }
      deps.emitEntry(submission)
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
