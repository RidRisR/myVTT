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
} from './types'
export type { DiceTermResult, DiceSpec } from '../shared/diceUtils'

// ── Utility hook exports ─────────────────────────────────────────────────────
export { usePluginTranslation } from '../i18n/pluginI18n'
export { useHoldRepeat } from '../shared/useHoldRepeat'
export { useAwarenessResource } from '../hooks/useAwarenessResource'
export { usePluginPanels } from './usePluginPanels'

export { tokenizeExpression, buildCompoundResult } from '../shared/diceUtils'
export type { ChatRollMessage } from '../shared/chatTypes'
export type { RollCardProps } from './types'
