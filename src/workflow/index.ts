// src/workflow/index.ts — barrel exports
export { WorkflowEngine } from './engine'
export { PluginSDK, WorkflowRunner } from './pluginSDK'
export type { PluginSDKDeps } from './pluginSDK'
export { createWorkflowContext } from './context'
export type { ContextDeps, ContextOptions } from './context'
export type {
  Step,
  StepAddition,
  AttachStepAddition,
  StepFn,
  StepRunFn,
  WrapStepFn,
  WrapStepOptions,
  ReplaceStepOptions,
  WorkflowContext,
  WorkflowHandle,
  WorkflowResult,
  StepError,
  InternalState,
  IPluginSDK,
  IWorkflowRunner,
} from './types'
export { output } from './helpers'
export { getRenderer, registerRenderer, clearRenderers } from '../log/rendererRegistry'
export type { LogEntryRendererProps, LogEntryRenderer } from '../log/rendererRegistry'
export { registerBaseWorkflows, getQuickRollWorkflow } from './baseWorkflows'
export type { BaseRollData } from './baseWorkflows'
export {
  useWorkflowRunner,
  getWorkflowEngine,
  resetWorkflowEngine,
  registerWorkflowPlugins,
  getCommand,
  registerCommand,
} from './useWorkflowSDK'
