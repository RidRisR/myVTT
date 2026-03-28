// src/workflow/types.ts
import type { Entity } from '../shared/entityTypes'
import type { EventHandle } from '../events/eventBus'
import type { IUIRegistrationSDK } from '../ui-system/registrationTypes'
import type { GameLogEntry, LogPayloadMap, TriggerDefinition, Visibility } from '../shared/logTypes'
import type { DiceSpec } from '../shared/diceUtils'
import type { ComponentTypeMap } from '../shared/componentTypes'

// ── WorkflowHandle — phantom type for compile-time safety ─────────────────

/**
 * A typed handle returned by defineWorkflow. The phantom `__brand` exists only
 * at compile time — it is never assigned at runtime. Use handles (not strings)
 * to get automatic TData inference in addStep / attachStep / runWorkflow.
 *
 * TOutput defaults to TData for backward compatibility — existing
 * WorkflowHandle<BaseRollData> equals WorkflowHandle<BaseRollData, BaseRollData>.
 */
export interface WorkflowHandle<TData = Record<string, unknown>, TOutput = TData> {
  readonly name: string
  /** Phantom type — compile-time only, never assigned at runtime */
  readonly __brand: TData
  /** Phantom type for output — compile-time only, never assigned at runtime */
  readonly __outputBrand: TOutput
}

// ── Step & Step operations ────────────────────────────────────────────────

/** A single execution unit within a Workflow */
export interface Step<TData = Record<string, unknown>> {
  id: string
  critical?: boolean // default true; false = failure won't abort workflow
  readonly?: boolean // default false; true = vars frozen via Proxy, safe for cross-boundary insert
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}

/** Options for addStep — positions a new step relative to an existing one */
export interface StepAddition<TData = Record<string, unknown>> {
  id: string
  before?: string
  after?: string
  priority?: number // default 100, lower = first
  critical?: boolean // default true
  readonly?: boolean // default false; true = vars frozen, safe for cross-boundary insert
  phase?: 'post' // run after output computation; requires readonly: true
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}

/** Options for attachStep — like addStep but with lifecycle binding */
export interface AttachStepAddition<TData = Record<string, unknown>> {
  id: string
  to: string // lifecycle dependency target (also default after anchor)
  before?: string // optional: override positioning
  after?: string // optional: override positioning
  priority?: number
  critical?: boolean
  readonly?: boolean // default false; true = vars frozen, safe for cross-boundary insert
  phase?: 'post' // run after output computation; requires readonly: true
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}

/** The function signature for a step's run */
export type StepFn = (ctx: WorkflowContext) => Promise<void> | void
/** Generic step run function — used in defineWorkflow shorthand */
export type StepRunFn<TVars = Record<string, unknown>> = (
  ctx: WorkflowContext<TVars>,
) => Promise<void> | void
export type WrapStepFn = (ctx: WorkflowContext, original: StepFn) => Promise<void> | void

export interface WrapStepOptions {
  priority?: number // default 100, lower = outer layer
  run: WrapStepFn
}

export interface ReplaceStepOptions {
  run: (ctx: WorkflowContext) => Promise<void> | void
}

// ── WorkflowResult ────────────────────────────────────────────────────────

export interface StepError {
  stepId: string
  error: Error
}

/**
 * Discriminated union — output is only available when status === 'completed'.
 * Callers must check status before accessing output; TypeScript narrowing
 * enforces this automatically.
 */
export type WorkflowResult<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TOutput = TData,
> =
  | { status: 'completed'; data: TData; output: TOutput; errors: StepError[] }
  | {
      status: 'aborted'
      data: TData
      output: undefined
      reason?: string
      errors: StepError[]
    }

// ── InternalState — engine-private, not exported to plugins ───────────────

export interface InternalState {
  depth: number
  abortCtrl: { aborted: boolean; reason?: string }
}

// ── IDataReader — imperative store read (workflow steps, canDrop, event callbacks) ──

export interface IDataReader {
  entity(id: string): Entity | undefined
  component<K extends keyof ComponentTypeMap>(
    entityId: string,
    key: K,
  ): ComponentTypeMap[K] | undefined
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- fallback overload
  component<T = unknown>(entityId: string, key: string): T | undefined
  query(spec: { has?: string[] }): Entity[]
  formulaTokens(entityId: string): Record<string, number>
}

// ── WorkflowContext ───────────────────────────────────────────────────────

/** Runtime context passed to each step's run function */
export interface WorkflowContext<TVars = Record<string, unknown>> {
  /** Step-shared mutable vars. Getter-only — reference replacement throws TypeError. */
  readonly vars: TVars

  // ── Data access (imperative reads from store) ─────────────────────────
  readonly read: IDataReader

  // ── Input (returns value, suspends execution) ──────────────────────────
  /** Server-side dice roll via Socket.io (await ack) — returns full GameLogEntry with rolls */
  serverRoll(
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
  ): Promise<GameLogEntry>
  /** Pause workflow until UI resolves/cancels the interaction */
  requestInput(interactionId: string): Promise<unknown>

  // ── Effects (side effects, fire-and-forget) ───────────────────────────
  /** Emit a log entry (fire-and-forget via Socket.io) */
  emitEntry<T extends keyof LogPayloadMap>(partial: {
    type: T
    payload: LogPayloadMap[T]
    triggerable: boolean
    parentId?: string
    chainDepth?: number
    visibility?: Visibility
  }): void
  emitEntry(partial: {
    type: string
    payload: Record<string, unknown>
    triggerable: boolean
    parentId?: string
    chainDepth?: number
    visibility?: Visibility
  }): void
  updateComponent<K extends keyof ComponentTypeMap>(
    entityId: string,
    key: K,
    updater: (current: ComponentTypeMap[K] | undefined) => ComponentTypeMap[K],
  ): void
  updateComponent<T>(entityId: string, key: string, updater: (current: T | undefined) => T): void
  /** @deprecated — will be removed when teamTracker is redesigned */
  updateTeamTracker(label: string, patch: { current?: number }): void

  // ── Events (decoupled side effects via EventBus) ──────────────────────
  events: {
    emit<T>(handle: EventHandle<T>, payload: T): void
  }

  // ── Flow Control ──────────────────────────────────────────────────────
  abort(reason?: string): void
  runWorkflow<T extends Record<string, unknown> = Record<string, unknown>, TOut = T>(
    handle: WorkflowHandle<T, TOut>,
    data?: Partial<T>,
  ): Promise<WorkflowResult<T, TOut>>
}

// ── Plugin SDK — registration-time API (no runWorkflow) ─────────────────

export interface IPluginSDK {
  /** Define a new workflow owned by this plugin (cleaned up on deactivate) */
  defineWorkflow<TData extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    steps?: Step<TData>[] | StepRunFn<TData>,
  ): WorkflowHandle<TData, TData>
  /** Define a new workflow with a structured output extractor */
  defineWorkflow<TData extends Record<string, unknown>, TOutput>(
    name: string,
    steps: Step<TData>[],
    output: (vars: TData) => TOutput,
  ): WorkflowHandle<TData, TOutput>

  /** Look up an existing workflow by name (returns untyped handle) */
  getWorkflow(name: string): WorkflowHandle

  /* eslint-disable @typescript-eslint/no-explicit-any -- TOutput irrelevant for step manipulation */
  addStep<TData extends TBase, TBase = Record<string, unknown>>(
    handle: WorkflowHandle<TBase, any>,
    addition: StepAddition<TData>,
  ): void
  attachStep<TData extends TBase, TBase = Record<string, unknown>>(
    handle: WorkflowHandle<TBase, any>,
    addition: AttachStepAddition<TData>,
  ): void
  wrapStep(handle: WorkflowHandle<any, any>, targetStepId: string, options: WrapStepOptions): void
  replaceStep(
    handle: WorkflowHandle<any, any>,
    targetStepId: string,
    options: ReplaceStepOptions,
  ): void
  removeStep(handle: WorkflowHandle<any, any>, targetStepId: string): void
  inspectWorkflow(handle: WorkflowHandle<any, any>): string[]
  /* eslint-enable @typescript-eslint/no-explicit-any */
  /** Register a chat command (e.g., '.dd') that maps to a workflow */
  registerCommand(name: string, handle: WorkflowHandle): void
  registerTrigger(trigger: TriggerDefinition): void
  ui: IUIRegistrationSDK
}

// ── Workflow Runner — execution-time API (UI layer) ─────────────────────

export interface IWorkflowRunner {
  runWorkflow<TData extends Record<string, unknown> = Record<string, unknown>, TOut = TData>(
    handle: WorkflowHandle<TData, TOut>,
    data?: Partial<TData>,
  ): Promise<WorkflowResult<TData, TOut>>
}
