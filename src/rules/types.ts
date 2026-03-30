import type React from 'react'
import type { Entity } from '../shared/entityTypes'
import type { TeamTracker } from '../stores/worldStore'
import type { ChatRollMessage } from '../shared/chatTypes'
import type { ToolDefinition } from '../combat/tools/types'

// ── Adapter view types ─────────────────────────────────────────────────────

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

export type HideableElement = 'dock' | 'portrait-bar' | 'chat-panel' | 'gm-panel' | 'scene-controls'

export interface DieConfig {
  color?: string // hex color, e.g. '#fbbf24'
  label?: string // label shown above die, e.g. '希望'
}

/** Semantic configuration for a roll type's display. Plugins register this via rollResult() token. */
export interface RollResultConfig {
  dieConfigs: DieConfig[]
}

export interface RenderDiceOptions {
  footer?: {
    text: string
    color: string
  }
  /** Override the revealed total color (default: accent gold). Accepts hex e.g. '#dc2626' */
  totalColor?: string
}

export interface RollCardProps {
  message: ChatRollMessage
  isNew?: boolean
  renderDice: (configs?: DieConfig[], options?: RenderDiceOptions) => React.ReactNode
}

// ── Map integration types ──────────────────────────────────────────────────

export interface TokenActionContext {
  selectedTokenIds: string[]
  selectedEntities: Entity[]
  primaryTokenId: string | null
  primaryEntity: Entity | null
  role: 'GM' | 'PL'
}

export interface TargetingRequest {
  mode: 'single' | 'multiple' | 'sequential'
  count?: number
  filter?: 'enemy' | 'ally' | 'any'
  labels?: string[]
}

export interface TargetInfo {
  tokenId: string
  entity: Entity
  index: number
  label?: string
}

export interface TokenAction {
  id: string
  label: string
  icon?: React.ComponentType
  targeting?: TargetingRequest
  onExecute: (actor: Entity, targets: TargetInfo[]) => void
  disabled?: boolean
  tooltip?: string
}

export interface ContextMenuContext {
  tokenId: string | null
  entity: Entity | null
  role: 'GM' | 'PL'
  selectedTokenIds: string[]
  mapX: number
  mapY: number
}

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ComponentType
  onClick: () => void
  gmOnly?: boolean
  danger?: boolean
  separator?: 'before' | 'after'
}

export interface KeyBinding {
  key: string
  label: string
  action: () => void
  when?: 'always' | 'token-selected'
}

// ── RulePlugin — the main interface ────────────────────────────────────────

// ── i18n types ──────────────────────────────────────────────────────────────

/** Plugin-provided translations. Keys are language codes, values are flat key-value maps. */
export interface PluginI18n {
  resources: Record<string, Record<string, string>>
}

export interface RulePlugin {
  id: string
  name: string
  sdkVersion: '1'

  // i18n translations (optional — falls back to key itself if not provided)
  i18n?: PluginI18n

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
    evaluateRoll(rolls: number[][], total: number): JudgmentResult | null
    getJudgmentDisplay(result: JudgmentResult): JudgmentDisplay
  }

  // Layer 4: Data templates (optional)
  dataTemplates?: {
    createDefaultEntityData(): Record<string, unknown>
    getPresetTemplates?(): PresetTemplate[]
  }

  // Layer 5: UI surfaces (optional)
  surfaces?: {
    panels?: PluginPanelDef[]
    dockTabs?: DockTabDef[]
    gmTabs?: GMTabDef[]
    teamPanel?: React.ComponentType<TeamPanelProps>

    // ── map integration ──
    tools?: ToolDefinition[]
    getTokenActions?: (ctx: TokenActionContext) => TokenAction[]
    getContextMenuItems?: (ctx: ContextMenuContext) => ContextMenuItem[]
    keyBindings?: KeyBinding[]
  }

  // Layer 6: Declarative element hiding (optional)
  hideElements?: HideableElement[]

  // Layer 7: Rule resolution — reserved, not implemented
  // ruleResolution?: RuleResolutionModule
}

// ── VTTPlugin — new imperative plugin interface (coexists with RulePlugin) ──

export interface VTTPlugin {
  id: string
  dependencies?: string[]
  onActivate(sdk: import('../workflow/types').IPluginSDK): void
  onDeactivate?(sdk: import('../workflow/types').IPluginSDK): void
}
