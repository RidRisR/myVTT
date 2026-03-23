// plugins/daggerheart/diceSystem.ts
import type {
  Entity,
  DiceTermResult,
  JudgmentResult,
  JudgmentDisplay,
  DieStyle,
  RollAction,
  DaggerheartOutcome,
} from '@myvtt/sdk'
import type { DHAttributes } from './types'
import { DH_KEYS } from './types'

const DH_DC = 12 // DaggerHeart standard action roll difficulty

export function dhEvaluateRoll(rolls: number[][], total: number): JudgmentResult | null {
  if (rolls.length === 0 || (rolls[0]?.length ?? 0) < 2) return null
  // Guard above ensures rolls[0] exists and has at least 2 elements
  const roll = rolls[0] as number[]
  const hopeDie = roll[0] as number
  const fearDie = roll[1] as number
  const succeeded = total >= DH_DC

  let outcome: DaggerheartOutcome
  if (hopeDie === fearDie) {
    outcome = 'critical_success'
  } else if (succeeded) {
    outcome = hopeDie > fearDie ? 'success_hope' : 'success_fear'
  } else {
    outcome = hopeDie > fearDie ? 'failure_hope' : 'failure_fear'
  }
  return { type: 'daggerheart', hopeDie, fearDie, outcome }
}

export function dhGetDieStyles(rolls: number[][]): DieStyle[] {
  if (rolls.length === 0 || (rolls[0]?.length ?? 0) < 2) return []
  return [
    { termIndex: 0, dieIndex: 0, label: 'die.hope', color: '#fbbf24' },
    { termIndex: 0, dieIndex: 1, label: 'die.fear', color: '#dc2626' },
  ]
}

export function dhGetJudgmentDisplay(result: JudgmentResult): JudgmentDisplay {
  if (result.type !== 'daggerheart')
    return { text: 'judgment.unknown', color: '#64748b', severity: 'partial' }
  switch (result.outcome) {
    case 'critical_success':
      return { text: 'judgment.critical', color: '#a78bfa', severity: 'critical' }
    case 'success_hope':
      return { text: 'judgment.successHope', color: '#fbbf24', severity: 'success' }
    case 'success_fear':
      return { text: 'judgment.successFear', color: '#f97316', severity: 'partial' }
    case 'failure_hope':
      return { text: 'judgment.failureHope', color: '#60a5fa', severity: 'failure' }
    case 'failure_fear':
      return { text: 'judgment.failureFear', color: '#ef4444', severity: 'fumble' }
  }
}

const ROLL_ATTR_KEYS = [
  'agility',
  'strength',
  'finesse',
  'instinct',
  'presence',
  'knowledge',
] as const

export function dhGetRollActions(entity: Entity): RollAction[] {
  const attrs = entity.components[DH_KEYS.attributes] as DHAttributes | undefined
  if (!attrs) return []
  return ROLL_ATTR_KEYS.map((key) => ({
    id: key,
    name: `roll.action.${key}`,
    formula: `2d12+@${key}`,
    targetAttributeKey: key,
  }))
}

/** Roll commands registered by this plugin — used by ChatInput to handle .dd command */
export const rollCommands: Record<string, { resolveFormula(modifierExpr?: string): string }> = {
  'daggerheart:dd': {
    resolveFormula(modifierExpr?: string): string {
      const mod = (modifierExpr ?? '').trim()
      if (!mod) return '2d12'
      return `2d12${mod.startsWith('+') || mod.startsWith('-') ? mod : '+' + mod}`
    },
  },
}

// getDieStyles wrapper for RulePlugin interface (takes termResults for API consistency)
// v1 stub — DH die styling is handled by DHRollCard directly (calls dhGetDieStyles(message.rolls));
// generic consumers that call plugin.diceSystem.getDieStyles() get no styles for DH rolls.
export function dhGetDieStylesFromTerms(_terms: DiceTermResult[]): DieStyle[] {
  // intentionally empty — DHRollCard uses dhGetDieStyles(rolls: number[][]) directly
  return []
}
