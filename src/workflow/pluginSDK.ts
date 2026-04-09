// src/workflow/pluginSDK.ts
import type {
  IPluginSDK,
  IWorkflowRunner,
  Step,
  StepAddition,
  AttachStepAddition,
  StepRunFn,
  WrapStepOptions,
  ReplaceStepOptions,
  WorkflowHandle,
  WorkflowResult,
  ChainContext,
} from './types'
import type { WorkflowEngine } from './engine'
import type { ContextDeps } from './context'
import { createWorkflowContext } from './context'
import type { IUIRegistrationSDK } from '../ui-system/registrationTypes'
import type { UIRegistry } from '../ui-system/registry'
import type { TriggerDefinition } from '../shared/logTypes'
import { TriggerRegistry } from './triggerRegistry'
import { registerCommand } from './commandRegistry'
import {
  registerRenderer as registerRendererFn,
  type LogEntryRenderer,
} from '../log/rendererRegistry'

/** Validate that a key uses the plugin's namespace prefix */
function assertNamespaced(pluginId: string, key: string, label: string): void {
  if (!key.startsWith(pluginId + ':')) {
    throw new Error(`${label} "${key}" must be prefixed with "${pluginId}:"`)
  }
}

/** Validate command name starts with dot */
function assertCommandPrefix(name: string): void {
  if (!name.startsWith('.')) {
    throw new Error(`Command "${name}" must start with "."`)
  }
}

export type PluginSDKDeps = Omit<ContextDeps, 'engine'>
// PluginSDKDeps = { emitEntry, serverRoll, getEntity, getAllEntities, getActiveOrigin, getSeatId, getLogWatermark }

/**
 * Registration-time API for plugins. No runWorkflow — plugins must use
 * ctx.runWorkflow (inside steps) or the UI layer's IWorkflowRunner.
 */
export class PluginSDK implements IPluginSDK {
  private engine: WorkflowEngine
  private pluginId: string
  private triggerRegistry?: TriggerRegistry
  readonly ui: IUIRegistrationSDK

  constructor(
    engine: WorkflowEngine,
    pluginId: string,
    uiRegistry?: UIRegistry,
    triggerRegistry?: TriggerRegistry,
  ) {
    this.engine = engine
    this.pluginId = pluginId
    this.triggerRegistry = triggerRegistry
    this.ui = uiRegistry
      ? {
          registerRegion: (def) => {
            uiRegistry.registerRegion(def)
          },
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional backward-compat delegation
          registerComponent: (def) => {
            uiRegistry.registerComponent(def)
          },
          registerLayer: (def) => {
            uiRegistry.registerLayer(def)
          },
          registerRenderer: (...args: [unknown, unknown, unknown?]) => {
            if (typeof args[0] === 'string') {
              registerRendererFn(args[0], args[1] as string, args[2] as LogEntryRenderer)
            } else {
              // RendererPoint<T> token path
              registerRendererFn(args[0] as { surface: string; type: string }, args[1])
            }
          },
          registerInputHandler: (inputType, def) => {
            uiRegistry.registerInputHandler(inputType, def)
          },
        }
      : {
          // no-op: existing tests do not pass a registry
          registerRegion: () => {},
          registerComponent: () => {},
          registerLayer: () => {},
          registerRenderer: () => {},
          registerInputHandler: () => {},
        }
  }

  defineWorkflow<TData extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    stepsOrRun?: Step<TData>[] | StepRunFn<TData>,
  ): WorkflowHandle<TData, TData>
  defineWorkflow<TData extends Record<string, unknown>, TOutput>(
    name: string,
    steps: Step<TData>[],
    outputFn: (vars: TData) => TOutput,
  ): WorkflowHandle<TData, TOutput>
  defineWorkflow<TData extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    stepsOrRun?: Step<TData>[] | StepRunFn<TData>,
    outputFn?: (vars: TData) => unknown,
  ): WorkflowHandle<TData> {
    assertNamespaced(this.pluginId, name, 'Workflow name')
    this.engine.setCurrentPluginOwner(this.pluginId)
    try {
      if (outputFn) {
        return this.engine.defineWorkflow(
          name,
          stepsOrRun as Step<TData>[],
          outputFn,
        ) as WorkflowHandle<TData>
      }
      return this.engine.defineWorkflow(name, stepsOrRun)
    } finally {
      this.engine.setCurrentPluginOwner(undefined)
    }
  }

  getWorkflow(name: string): WorkflowHandle {
    return this.engine.getWorkflow(name)
  }

  /* eslint-disable @typescript-eslint/no-explicit-any -- TOutput irrelevant for step manipulation */
  addStep<TData extends TBase, TBase = Record<string, unknown>>(
    handle: WorkflowHandle<TBase, any>,
    addition: StepAddition<TData>,
  ): void {
    this.engine.addStep(handle.name, addition as StepAddition, this.pluginId)
  }

  attachStep<TData extends TBase, TBase = Record<string, unknown>>(
    handle: WorkflowHandle<TBase, any>,
    addition: AttachStepAddition<TData>,
  ): void {
    this.engine.attachStep(handle.name, addition as AttachStepAddition, this.pluginId)
  }

  wrapStep(handle: WorkflowHandle<any, any>, targetStepId: string, options: WrapStepOptions): void {
    this.engine.wrapStep(handle.name, targetStepId, options, this.pluginId)
  }

  replaceStep(
    handle: WorkflowHandle<any, any>,
    targetStepId: string,
    options: ReplaceStepOptions,
  ): void {
    this.engine.replaceStep(handle.name, targetStepId, options, this.pluginId)
  }

  removeStep(handle: WorkflowHandle<any, any>, targetStepId: string): void {
    this.engine.removeStep(handle.name, targetStepId)
  }

  inspectWorkflow(handle: WorkflowHandle<any, any>): string[] {
    return this.engine.inspectWorkflow(handle.name)
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  registerTrigger(trigger: TriggerDefinition): void {
    assertNamespaced(this.pluginId, trigger.id, 'Trigger ID')
    if (!this.triggerRegistry) {
      throw new Error('TriggerRegistry not available')
    }
    this.triggerRegistry.register(trigger)
  }

  registerCommand(name: string, handle: WorkflowHandle): void {
    assertCommandPrefix(name)
    registerCommand(name, handle)
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

  runWorkflow<TData extends Record<string, unknown> = Record<string, unknown>, TOut = TData>(
    handle: WorkflowHandle<TData, TOut>,
    data?: Partial<TData>,
    chainCtx?: ChainContext,
  ): Promise<WorkflowResult<TData, TOut>> {
    const internal: import('./types').InternalState = {
      depth: 0,
      abortCtrl: { aborted: false },
    }
    const ctx = createWorkflowContext(
      { ...this.deps, engine: this.engine },
      (data ?? {}) as Record<string, unknown>,
      internal,
      chainCtx
        ? {
            groupId: chainCtx.groupId,
            chainDepth: chainCtx.chainDepth,
            causedBy: chainCtx.causedBy,
          }
        : undefined,
    )
    return this.engine.runWorkflow(handle.name, ctx, internal) as Promise<
      WorkflowResult<TData, TOut>
    >
  }
}
