// src/rules/sdk.ts
// The ONLY legal import path for plugins. Plugins may NOT import from src/ directly.

// ── Type exports ────────────────────────────────────────────────────────────
export type { Entity } from '../shared/entityTypes'
export type {
  RulePlugin,
  PluginI18n,
  ResourceView,
  StatusView,
  EntityCardProps,
  PluginPanelDef,
  PluginPanelProps,
  TeamPanelProps,
  PresetTemplate,
  DockTabDef,
  GMTabDef,
  HideableElement,
  RollAction,
  ModifierOption,
  JudgmentResult,
  JudgmentDisplay,
  DieStyle,
  RollContext,
  DaggerheartOutcome,
  DieConfig,
  RenderDiceOptions,
  TokenAction,
  TokenActionContext,
  TargetingRequest,
  TargetInfo,
  ContextMenuItem,
  ContextMenuContext,
  KeyBinding,
} from './types'
export type { DiceTermResult, DiceSpec } from '../shared/diceUtils'

// ── Utility hook exports ─────────────────────────────────────────────────────
export { usePluginTranslation } from '../i18n/pluginI18n'
export { useHoldRepeat } from '../shared/useHoldRepeat'
export { useAwarenessResource } from '../hooks/useAwarenessResource'
export { usePluginPanels } from './usePluginPanels'

export { tokenizeExpression, toDiceSpecs, buildCompoundResult } from '../shared/diceUtils'
export type { ChatRollMessage } from '../shared/chatTypes'
export type { RollCardProps } from './types'

// ── Tool types for plugin map integration ───────────────────────────────────
export type { ToolDefinition, ToolCategory, ToolLayerProps } from '../combat/tools/types'

// ── Workflow types (plugin cooperation model) ───────────────────────────────
export type {
  Step,
  StepAddition,
  AttachStepAddition,
  StepFn,
  WrapStepFn,
  WrapStepOptions,
  ReplaceStepOptions,
  WorkflowContext,
  WorkflowHandle,
  WorkflowResult,
  StepError,
  IPluginSDK,
  IWorkflowRunner,
  IDataReader,
  StepRunFn,
} from '../workflow/types'

// ── Workflow helpers ─────────────────────────────────────────────────────────
export { output } from '../workflow/helpers'

// ── EventBus (decoupled side effects) ──────────────────────────────────────
export { defineEvent } from '../events/eventBus'
export type { EventHandle } from '../events/eventBus'
export { toastEvent, announceEvent, animationEvent, soundEvent } from '../events/systemEvents'
export type {
  ToastPayload,
  AnnouncePayload,
  AnimationPayload,
  SoundPayload,
} from '../events/systemEvents'
export type { VTTPlugin } from './types'
export { getQuickRollWorkflow, getRollWorkflow } from '../workflow/baseWorkflows'
export type { BaseRollData, RollOutput } from '../workflow/baseWorkflows'
export { useWorkflowRunner } from '../workflow/useWorkflowSDK'

// ── Log renderer types ──────────────────────────────────────────────────────
export type { LogEntryRendererProps, LogEntryRenderer } from '../log/rendererRegistry'

// ── Data layer (reactive hooks + imperative reader) ────────────────────────
export { useEntity, useComponent } from '../data/hooks'
export { createDataReader } from '../data/dataReader'

// ── Core component accessors ───────────────────────────────────────────────
export {
  getIdentity,
  getToken,
  getNotes,
  getName,
  getColor,
  getImageUrl,
} from '../shared/coreComponents'
export type { CoreIdentity, CoreToken, CoreNotes } from '../shared/coreComponents'
