// src/workflow/types.ts
import type { Entity } from '../shared/entityTypes'

/** A single execution unit within a Workflow */
export interface Step {
  id: string
  run: (ctx: WorkflowContext) => Promise<void> | void
}

/** Options for addStep — positions a new step relative to an existing one */
export interface StepAddition {
  id: string
  before?: string
  after?: string
  priority?: number // default 100, lower = first
  run: (ctx: WorkflowContext) => Promise<void> | void
}

/** The function signature for a wrap step's run */
export type StepFn = (ctx: WorkflowContext) => Promise<void> | void
export type WrapStepFn = (ctx: WorkflowContext, original: StepFn) => Promise<void> | void

export interface WrapStepOptions {
  priority?: number // default 100, lower = outer layer
  run: WrapStepFn
}

/** Animation spec for playAnimation — POC keeps it simple */
export interface AnimationSpec {
  type: string
  data?: Record<string, unknown>
  durationMs?: number
}

export interface ToastOptions {
  variant?: 'info' | 'success' | 'warning' | 'error'
  durationMs?: number
}

/** Runtime context passed to each step's run function */
export interface WorkflowContext {
  data: Record<string, unknown>

  // Base capabilities
  serverRoll(formula: string): Promise<{ rolls: number[][]; total: number }>
  updateEntity(entityId: string, patch: Partial<Entity>): void
  updateTeamTracker(label: string, patch: { current?: number }): void
  announce(message: string): void
  showToast(text: string, options?: ToastOptions): void
  playAnimation(animation: AnimationSpec): Promise<void>
  playSound(sound: string): void

  // Flow control
  abort(reason?: string): void
  runWorkflow(name: string, data?: Record<string, unknown>): Promise<void>
}

/** Plugin SDK — registration-time API given to plugins via onActivate */
export interface IPluginSDK {
  defineWorkflow(name: string, steps: Step[]): void
  addStep(workflow: string, addition: StepAddition): void
  wrapStep(workflow: string, targetStepId: string, options: WrapStepOptions): void
  removeStep(workflow: string, targetStepId: string): void
  runWorkflow(name: string, data?: Record<string, unknown>): Promise<void>
  inspectWorkflow(name: string): string[]
}
