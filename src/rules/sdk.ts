// src/rules/sdk.ts
// The ONLY legal import path for plugins. Plugins may NOT import from src/ directly.

// ── Type exports ────────────────────────────────────────────────────────────
export type { Entity } from '../shared/entityTypes'
export type {
  RulePlugin,
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
} from './types'
export type { DiceTermResult, DiceSpec } from '../shared/diceUtils'

// ── Utility hook exports ─────────────────────────────────────────────────────
export { useHoldRepeat } from '../shared/useHoldRepeat'
export { useAwarenessResource } from '../shared/hooks/useAwarenessResource'
// usePluginPanels will be added when surfaces/panels system is implemented

export { tokenizeExpression, buildCompoundResult } from '../shared/diceUtils'
export type { ChatRollMessage } from '../chat/chatTypes'
export type { RollCardProps } from './types'
