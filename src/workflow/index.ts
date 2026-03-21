// src/workflow/index.ts — barrel exports
export { WorkflowEngine } from './engine'
export { PluginSDK } from './pluginSDK'
export type { PluginSDKDeps } from './pluginSDK'
export { createWorkflowContext } from './context'
export type { ContextDeps } from './context'
export type {
  Step,
  StepAddition,
  StepFn,
  WrapStepFn,
  WrapStepOptions,
  AnimationSpec,
  ToastOptions,
  WorkflowContext,
  IPluginSDK,
} from './types'
export { registerBaseWorkflows } from './baseWorkflows'
export { useWorkflowSDK, getWorkflowEngine, resetWorkflowEngine } from './useWorkflowSDK'
