import type React from 'react'
import type { Entity } from '../shared/entityTypes'
import type { ChatRollMessage } from '../shared/chatTypes'

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
  | 'hope_unknown'
  | 'fear_unknown'

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

// ── i18n types ──────────────────────────────────────────────────────────────

/** Plugin-provided translations. Keys are language codes, values are flat key-value maps. */
export interface PluginI18n {
  resources: Record<string, Record<string, string>>
}

// ── VTTPlugin — imperative plugin interface ──

export interface VTTPlugin {
  id: string
  /** When set, the plugin is only activated if the room's ruleSystemId matches. Undefined = always active. */
  ruleSystemId?: string
  dependencies?: string[]
  onActivate(sdk: import('../workflow/types').IPluginSDK): void
  onReady?(ctx: import('../workflow/types').WorkflowContext): void | Promise<void>
  onDeactivate?(sdk: import('../workflow/types').IPluginSDK): void
}
