// src/workflow/index.ts — barrel exports
export { WorkflowEngine } from './engine'
export { PluginSDK, WorkflowRunner } from './pluginSDK'
export type { PluginSDKDeps } from './pluginSDK'
export { createWorkflowContext } from './context'
export type { ContextDeps } from './context'
export type {
  Cloneable,
  Step,
  StepAddition,
  AttachStepAddition,
  StepFn,
  WrapStepFn,
  WrapStepOptions,
  ReplaceStepOptions,
  AnimationSpec,
  ToastOptions,
  WorkflowContext,
  WorkflowHandle,
  WorkflowResult,
  StepError,
  InternalState,
  IPluginSDK,
  IWorkflowRunner,
} from './types'
export { registerBaseWorkflows, rollWorkflow } from './baseWorkflows'
export type { BaseRollData } from './baseWorkflows'
export {
  useWorkflowSDK,
  useWorkflowRunner,
  getWorkflowEngine,
  resetWorkflowEngine,
} from './useWorkflowSDK'
