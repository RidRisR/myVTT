// src/workflow/types.ts
import type { Entity } from '../shared/entityTypes'
import type { IUIRegistrationSDK } from '../ui-system/registrationTypes'

// ── Cloneable — documented convention for ctx.data values ─────────────────

/**
 * Types safe for structuredClone. ctx.data should only contain Cloneable values.
 * This is enforced at runtime (structuredClone try/catch) rather than at compile
 * time, because TypeScript interfaces lack implicit index signatures which makes
 * generic constraints impractical. Exported for documentation/testing purposes.
 */
export type Cloneable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | RegExp
  | Map<Cloneable, Cloneable>
  | Set<Cloneable>
  | Cloneable[]
  | { [key: string]: Cloneable }

// ── WorkflowHandle — phantom type for compile-time safety ─────────────────

/**
 * A typed handle returned by defineWorkflow. The phantom `__brand` exists only
 * at compile time — it is never assigned at runtime. Use handles (not strings)
 * to get automatic TData inference in addStep / attachStep / runWorkflow.
 */
export interface WorkflowHandle<TData = Record<string, unknown>> {
  readonly name: string
  /** Phantom type — compile-time only, never assigned at runtime */
  readonly __brand: TData
}

// ── Step & Step operations ────────────────────────────────────────────────

/** A single execution unit within a Workflow */
export interface Step<TData = Record<string, unknown>> {
  id: string
  critical?: boolean // default true; false = failure won't abort workflow
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}

/** Options for addStep — positions a new step relative to an existing one */
export interface StepAddition<TData = Record<string, unknown>> {
  id: string
  before?: string
  after?: string
  priority?: number // default 100, lower = first
  critical?: boolean // default true
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
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}

/** The function signature for a step's run */
export type StepFn = (ctx: WorkflowContext) => Promise<void> | void
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

export interface WorkflowResult<TData extends Record<string, unknown> = Record<string, unknown>> {
  status: 'completed' | 'aborted'
  reason?: string
  data: TData
  errors: StepError[]
}

// ── InternalState — engine-private, not exported to plugins ───────────────

export interface InternalState {
  depth: number
  abortCtrl: { aborted: boolean; reason?: string }
  /** Proxy data control — set by createWorkflowContext, used by engine for snapshot/restore */
  dataCtrl: {
    getInner: () => Record<string, unknown>
    replaceInner: (replacement: Record<string, unknown>) => void
  }
}

// ── Animation / Toast ─────────────────────────────────────────────────────

/** Animation spec for playAnimation */
export interface AnimationSpec {
  type: string
  data?: Record<string, unknown>
  durationMs?: number
}

export interface ToastOptions {
  variant?: 'info' | 'success' | 'warning' | 'error'
  durationMs?: number
}

// ── WorkflowContext ───────────────────────────────────────────────────────

/** Runtime context passed to each step's run function */
export interface WorkflowContext<TData = Record<string, unknown>> {
  /** Step-shared data. Getter-only — reference replacement throws TypeError. */
  readonly data: TData

  // ── Input (returns value, immediate execution) ────────────────────────
  serverRoll(formula: string): Promise<{ rolls: number[][]; total: number }>

  // ── Effects (side effects, fire-and-forget) ───────────────────────────
  updateEntity(entityId: string, patch: Partial<Entity>): void
  updateTeamTracker(label: string, patch: { current?: number }): void
  announce(message: string): void
  showToast(text: string, options?: ToastOptions): void
  playAnimation(animation: AnimationSpec): Promise<void>
  playSound(sound: string): void

  // ── Flow Control ──────────────────────────────────────────────────────
  abort(reason?: string): void
  runWorkflow<T extends Record<string, unknown> = Record<string, unknown>>(
    handle: WorkflowHandle<T>,
    data?: Partial<T>,
  ): Promise<WorkflowResult<T>>
}

// ── Plugin SDK — registration-time API (no runWorkflow) ─────────────────

export interface IPluginSDK {
  addStep<TData extends TBase, TBase = Record<string, unknown>>(
    handle: WorkflowHandle<TBase>,
    addition: StepAddition<TData>,
  ): void
  attachStep<TData extends TBase, TBase = Record<string, unknown>>(
    handle: WorkflowHandle<TBase>,
    addition: AttachStepAddition<TData>,
  ): void
  wrapStep(handle: WorkflowHandle, targetStepId: string, options: WrapStepOptions): void
  replaceStep(handle: WorkflowHandle, targetStepId: string, options: ReplaceStepOptions): void
  removeStep(handle: WorkflowHandle, targetStepId: string): void
  inspectWorkflow(handle: WorkflowHandle): string[]
  ui: IUIRegistrationSDK
}

// ── Workflow Runner — execution-time API (UI layer) ─────────────────────

export interface IWorkflowRunner {
  runWorkflow<TData extends Record<string, unknown> = Record<string, unknown>>(
    handle: WorkflowHandle<TData>,
    data?: Partial<TData>,
  ): Promise<WorkflowResult<TData>>
}
