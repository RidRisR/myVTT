import type React from 'react'
import type { Character } from '../shared/characterTypes'
import type { Resource, Attribute } from '../shared/tokenTypes'
import type { DiceTermResult } from '../shared/diceUtils'

/** A clickable roll button on the character card */
export interface RollAction {
  id: string
  name: string                  // "Agility Check"
  formula: string               // "2d12+@Agility"
  category?: string             // "action", "skill", "combat"
  targetAttributeKey?: string   // for future CoC: which attribute to compare against
}

/** A toggle in the roll confirmation panel */
export interface ModifierOption {
  id: string
  label: string                 // "奖励骰", "优势"
  type: 'toggle'
  mutuallyExclusiveWith?: string
}

/** The 5 possible outcomes in Daggerheart */
export type DaggerheartOutcome =
  | 'critical_success'
  | 'success_hope'
  | 'success_fear'
  | 'failure_hope'
  | 'failure_fear'

/** Each rule defines its own judgment shape */
export type JudgmentResult =
  | { type: 'daggerheart'; hopeDie: number; fearDie: number; outcome: DaggerheartOutcome }
  | { type: 'coc'; roll: number; targetValue: number; successLevel: string }
  | { type: 'target_check'; total: number; dc: number; success: boolean; margin: number }

/** How to render the judgment in the UI */
export interface JudgmentDisplay {
  text: string                  // "成功 (Hope)"
  color: string                 // "#22c55e"
  severity: 'critical' | 'success' | 'partial' | 'failure' | 'fumble'
}

/** Per-die color/label configuration */
export interface DieStyle {
  termIndex: number
  dieIndex: number
  label?: string                // "Hope"
  color?: string                // "#f59e0b"
}

/** Context passed to evaluateRoll */
export interface RollContext {
  dc?: number
  targetValue?: number
  activeModifierIds: string[]
  tempModifier: number
}

/** Props the base provides to rule character cards */
export interface CharacterCardProps {
  character: Character
  onUpdateCharacter: (id: string, updates: Partial<Character>) => void
  onRollAction: (action: RollAction) => void
}

/** The main interface rules implement */
export interface RuleSystem {
  id: string
  name: string
  getDefaultAttributes(): Attribute[]
  getDefaultResources(): Resource[]
  CharacterCard: React.ComponentType<CharacterCardProps>
  getRollActions(character: Character): RollAction[]
  evaluateRoll(termResults: DiceTermResult[], total: number, context: RollContext): JudgmentResult | null
  getDieStyles(termResults: DiceTermResult[]): DieStyle[]
  getJudgmentDisplay(result: JudgmentResult): JudgmentDisplay
  getModifierOptions(): ModifierOption[]
}
