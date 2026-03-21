// src/workflow/pluginSDK.ts
import type { IPluginSDK, Step, StepAddition, WrapStepOptions } from './types'
import type { WorkflowEngine } from './engine'
import type { ContextDeps } from './context'
import { createWorkflowContext } from './context'

export type PluginSDKDeps = Omit<ContextDeps, 'engine'>

export class PluginSDK implements IPluginSDK {
  constructor(
    private engine: WorkflowEngine,
    private deps: PluginSDKDeps,
  ) {}

  defineWorkflow(name: string, steps: Step[]): void {
    this.engine.defineWorkflow(name, steps)
  }

  addStep(workflow: string, addition: StepAddition): void {
    this.engine.addStep(workflow, addition)
  }

  wrapStep(workflow: string, targetStepId: string, options: WrapStepOptions): void {
    this.engine.wrapStep(workflow, targetStepId, options)
  }

  removeStep(workflow: string, targetStepId: string): void {
    this.engine.removeStep(workflow, targetStepId)
  }

  inspectWorkflow(name: string): string[] {
    return this.engine.inspectWorkflow(name)
  }

  runWorkflow(name: string, data?: Record<string, unknown>): Promise<void> {
    const ctx = createWorkflowContext({ ...this.deps, engine: this.engine }, data)
    return this.engine.runWorkflow(name, ctx)
  }
}
