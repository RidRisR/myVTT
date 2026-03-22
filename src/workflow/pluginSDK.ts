// src/workflow/pluginSDK.ts
import type {
  IPluginSDK,
  IWorkflowRunner,
  StepAddition,
  AttachStepAddition,
  WrapStepOptions,
  ReplaceStepOptions,
  WorkflowHandle,
  WorkflowResult,
} from './types'
import type { WorkflowEngine } from './engine'
import type { ContextDeps } from './context'
import { createWorkflowContext } from './context'
import type { IUIRegistrationSDK } from '../ui-system/registrationTypes'
import type { UIRegistry } from '../ui-system/registry'

export type PluginSDKDeps = Omit<ContextDeps, 'engine'>

/**
 * Registration-time API for plugins. No runWorkflow — plugins must use
 * ctx.runWorkflow (inside steps) or the UI layer's IWorkflowRunner.
 */
export class PluginSDK implements IPluginSDK {
  private engine: WorkflowEngine
  private pluginId: string
  readonly ui: IUIRegistrationSDK

  constructor(engine: WorkflowEngine, pluginId: string, uiRegistry?: UIRegistry) {
    this.engine = engine
    this.pluginId = pluginId
    this.ui = uiRegistry
      ? {
          registerComponent: (def) => {
            uiRegistry.registerComponent(def)
          },
          registerLayer: (def) => {
            uiRegistry.registerLayer(def)
          },
        }
      : {
          // no-op: existing tests do not pass a registry
          registerComponent: () => {},
          registerLayer: () => {},
        }
  }

  addStep<TData extends TBase, TBase = Record<string, unknown>>(
    handle: WorkflowHandle<TBase>,
    addition: StepAddition<TData>,
  ): void {
    this.engine.addStep(handle.name, addition as StepAddition, this.pluginId)
  }

  attachStep<TData extends TBase, TBase = Record<string, unknown>>(
    handle: WorkflowHandle<TBase>,
    addition: AttachStepAddition<TData>,
  ): void {
    this.engine.attachStep(handle.name, addition as AttachStepAddition, this.pluginId)
  }

  wrapStep(handle: WorkflowHandle, targetStepId: string, options: WrapStepOptions): void {
    this.engine.wrapStep(handle.name, targetStepId, options, this.pluginId)
  }

  replaceStep(handle: WorkflowHandle, targetStepId: string, options: ReplaceStepOptions): void {
    this.engine.replaceStep(handle.name, targetStepId, options, this.pluginId)
  }

  removeStep(handle: WorkflowHandle, targetStepId: string): void {
    this.engine.removeStep(handle.name, targetStepId)
  }

  inspectWorkflow(handle: WorkflowHandle): string[] {
    return this.engine.inspectWorkflow(handle.name)
  }
}

/**
 * Execution-time API for UI layer. Creates InternalState per run, ensuring
 * depth tracking and abort isolation.
 */
export class WorkflowRunner implements IWorkflowRunner {
  private engine: WorkflowEngine
  private deps: PluginSDKDeps

  constructor(engine: WorkflowEngine, deps: PluginSDKDeps) {
    this.engine = engine
    this.deps = deps
  }

  runWorkflow<TData extends Record<string, unknown> = Record<string, unknown>>(
    handle: WorkflowHandle<TData>,
    data?: Partial<TData>,
  ): Promise<WorkflowResult<TData>> {
    const internal: import('./types').InternalState = {
      depth: 0,
      abortCtrl: { aborted: false },
      dataCtrl: { getInner: () => ({}), replaceInner: () => {} }, // overwritten by createWorkflowContext
    }
    const ctx = createWorkflowContext(
      { ...this.deps, engine: this.engine },
      (data ?? {}) as Record<string, unknown>,
      internal,
    )
    return this.engine.runWorkflow(handle.name, ctx, internal) as Promise<WorkflowResult<TData>>
  }
}
