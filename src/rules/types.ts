import type React from 'react'
import type { Entity } from '../shared/entityTypes'
import type { DiceTermResult } from '../shared/diceUtils'
import type { TeamTracker } from '../stores/worldStore'
import type { ChatRollMessage } from '../chat/chatTypes'

// ── Adapter view types (shared with entityAdapters.ts) ─────────────────────

export interface ResourceView {
  label: string
  current: number
  max: number
  color: string
}

export interface StatusView {
  label: string
}

// ── Dice types ──────────────────────────────────────────────────────────────

export interface RollAction {
  id: string
  name: string // "Agility Check"
  formula: string // "2d12+@Agility"
  category?: string
  targetAttributeKey?: string
}

export interface ModifierOption {
  id: string
  label: string
  type: 'toggle'
  mutuallyExclusiveWith?: string
}

export type DaggerheartOutcome =
  | 'critical_success'
  | 'success_hope'
  | 'success_fear'
  | 'failure_hope'
  | 'failure_fear'

export type JudgmentResult =
  | { type: 'daggerheart'; hopeDie: number; fearDie: number; outcome: DaggerheartOutcome }
  | { type: 'coc'; roll: number; targetValue: number; successLevel: string }
  | { type: 'target_check'; total: number; dc: number; success: boolean; margin: number }

export interface JudgmentDisplay {
  text: string
  color: string
  severity: 'critical' | 'success' | 'partial' | 'failure' | 'fumble'
}

export interface DieStyle {
  termIndex: number
  dieIndex: number
  label?: string
  color?: string
}

export interface RollContext {
  dc?: number
  targetValue?: number
  activeModifierIds: string[]
  tempModifier: number
}

// ── UI prop types ───────────────────────────────────────────────────────────

/** Props the base provides to the plugin's entity card */
export interface EntityCardProps {
  entity: Entity
  onUpdate: (patch: Partial<Entity>) => void
  readonly?: boolean
}

export interface PluginPanelDef {
  id: string
  component: React.ComponentType<PluginPanelProps>
  defaultSize?: { width: number; height: number }
  placement: 'floating' | 'fullscreen-overlay'
}

export interface PluginPanelProps {
  entity?: Entity
  onClose: () => void
  onUpdateEntity: (id: string, patch: Partial<Entity>) => void
  onCreateEntity: (data: Partial<Entity>) => void
}

export interface TeamPanelProps {
  trackers: TeamTracker[]
  onUpdate: (id: string, patch: Partial<TeamTracker>) => void
  onCreate: (data: Partial<TeamTracker>) => void
  onDelete: (id: string) => void
}

/** Preset content bundled with the plugin (not stored in DB until GM imports it) */
export interface PresetTemplate {
  id: string // namespace ID e.g. 'dh:corrupt-elf-archer'
  name: string
  category: string // 'adversary' | 'pc-archetype' | ...
  data: Partial<Entity>
}

export interface DockTabDef {
  id: string
  label: string
  component: React.ComponentType
}

export interface GMTabDef {
  id: string
  label: string
  component: React.ComponentType
}

export type HideableElement =
  | 'dock'
  | 'portrait-bar'
  | 'chat-panel'
  | 'gm-panel'
  | 'scene-controls'

export interface DieConfig {
  color?: string // hex color, e.g. '#fbbf24'
  label?: string // label shown above die, e.g. '希望'
}

export interface RenderDiceOptions {
  footer?: {
    text: string
    color: string
  }
}

export interface RollCardProps {
  message: ChatRollMessage
  isNew?: boolean
  renderDice: (configs?: DieConfig[], options?: RenderDiceOptions) => React.ReactNode
}

// ── RulePlugin — the main interface ────────────────────────────────────────

export interface RulePlugin {
  id: string
  name: string
  sdkVersion: '1'

  // Layer 1: Adapters — read entity data for generic base UI
  adapters: {
    getMainResource(entity: Entity): ResourceView | null
    getPortraitResources(entity: Entity): ResourceView[]
    getStatuses(entity: Entity): StatusView[]
    getFormulaTokens(entity: Entity): Record<string, number>
  }

  // Layer 2: Character card UI slot
  characterUI: {
    EntityCard: React.ComponentType<EntityCardProps>
  }

  // Layer 3: Dice system (optional)
  diceSystem?: {
    getRollActions(entity: Entity): RollAction[]
    evaluateRoll(rolls: number[][], total: number): JudgmentResult | null // 改：纯 rolls 输入
    getDieStyles(terms: DiceTermResult[]): DieStyle[]
    getJudgmentDisplay(result: JudgmentResult): JudgmentDisplay
    getModifierOptions(): ModifierOption[]
    // NEW: 插件注册的自定义投骰命令
    rollCommands?: Record<string, { resolveFormula(modifierExpr?: string): string }>
  }

  // Layer 4: Data templates (optional)
  dataTemplates?: {
    createDefaultEntityData(): unknown
    getPresetTemplates?(): PresetTemplate[]
  }

  // Layer 5: UI surfaces (optional)
  surfaces?: {
    panels?: PluginPanelDef[]
    dockTabs?: DockTabDef[]
    gmTabs?: GMTabDef[]
    teamPanel?: React.ComponentType<TeamPanelProps>
    rollCardRenderers?: Record<string, React.ComponentType<RollCardProps>> // NEW
  }

  // Layer 6: Declarative element hiding (optional)
  hideElements?: HideableElement[]

  // Layer 7: Rule resolution — reserved, not implemented
  // ruleResolution?: RuleResolutionModule
}
