import type {
  WorkflowContext,
  InternalState,
  WorkflowHandle,
  WorkflowResult,
} from '../src/workflow/types'
import type { IDataReader } from './types'
import type { EventBus, EventHandle } from './eventBus'
import { usePocStore } from './store'
import type { WorkflowEngine } from '../src/workflow/engine'

export interface PocContextDeps {
  dataReader: IDataReader
  eventBus: EventBus
  engine: WorkflowEngine
}

export interface PocWorkflowContext<TState = Record<string, unknown>> {
  // New POC interface
  state: TState
  read: IDataReader
  updateComponent: (entityId: string, key: string, updater: (current: unknown) => unknown) => void
  patchGlobal: (key: string, patch: Record<string, unknown>) => void
  events: { emit: <T>(handle: EventHandle<T>, payload: T) => void }
  // Old interface compat
  readonly data: TState
  abort: (reason?: string) => void
  runWorkflow: <T extends Record<string, unknown>>(
    handle: WorkflowHandle<T>,
    data?: Partial<T>,
  ) => Promise<WorkflowResult<T>>
}

/**
 * Create an InternalState compatible with main's engine (which requires dataCtrl).
 * POC doesn't use snapshot/restore, so dataCtrl is a no-op passthrough.
 */
export function createPocInternal(): InternalState {
  const inner: Record<string, unknown> = {}
  return {
    depth: 0,
    abortCtrl: { aborted: false },
    dataCtrl: {
      getInner: () => inner,
      replaceInner: (replacement) => {
        Object.keys(inner).forEach((k) => {
          delete inner[k]
        })
        Object.assign(inner, replacement)
      },
    },
  }
}

export function createPocWorkflowContext<TState extends Record<string, unknown>>(
  deps: PocContextDeps,
  initialState: TState,
  internal: InternalState,
): PocWorkflowContext<TState> {
  const stateObj = { ...initialState }

  const ctx: PocWorkflowContext<TState> = {
    get data() {
      return stateObj
    },
    get state() {
      return stateObj
    },
    read: deps.dataReader,
    updateComponent: (entityId: string, key: string, updater: (current: unknown) => unknown) => {
      usePocStore.getState().updateEntityComponent(entityId, key, updater)
    },
    patchGlobal: (key: string, patch: Record<string, unknown>) => {
      usePocStore.getState().patchGlobal(key, patch)
    },
    events: {
      emit: <T>(handle: EventHandle<T>, payload: T) => {
        deps.eventBus.emit(handle, payload)
      },
    },
    abort: (reason?: string) => {
      internal.abortCtrl.aborted = true
      internal.abortCtrl.reason = reason
    },
    runWorkflow: async <T extends Record<string, unknown>>(
      handle: WorkflowHandle<T>,
      data?: Partial<T>,
    ) => {
      const nestedCtx = createPocWorkflowContext(
        deps,
        (data ?? {}) as T & Record<string, unknown>,
        internal,
      )
      return deps.engine.runWorkflow(
        handle.name,
        nestedCtx as unknown as WorkflowContext,
        internal,
      ) as Promise<WorkflowResult<T>>
    },
    // Stubs for old interface (engine doesn't call these, but TypeScript needs them)
    updateEntity: () => {},
    updateTeamTracker: () => {},
    serverRoll: () => Promise.resolve({ rolls: [], total: 0 }),
    showToast: () => {},
    announce: () => {},
    playAnimation: () => Promise.resolve(),
    playSound: () => {},
  } as unknown as PocWorkflowContext<TState>

  return ctx
}
