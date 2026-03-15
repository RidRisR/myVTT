// plugins/daggerheart/diceSystem.ts
import type { Entity, DiceTermResult, JudgmentResult, JudgmentDisplay, DieStyle, RollAction, DaggerheartOutcome } from '@myvtt/sdk'

const DH_DC = 12 // DaggerHeart standard action roll difficulty

export function dhEvaluateRoll(rolls: number[][], total: number): JudgmentResult | null {
  if (rolls.length === 0 || (rolls[0]?.length ?? 0) < 2) return null
  const [hopeDie, fearDie] = rolls[0]
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
    { termIndex: 0, dieIndex: 0, label: '希望', color: '#fbbf24' },
    { termIndex: 0, dieIndex: 1, label: '恐惧', color: '#dc2626' },
  ]
}

export function dhGetJudgmentDisplay(result: JudgmentResult): JudgmentDisplay {
  if (result.type !== 'daggerheart') return { text: '未知判定', color: '#64748b', severity: 'partial' }
  switch (result.outcome) {
    case 'critical_success': return { text: '命运临界！', color: '#a78bfa', severity: 'critical' }
    case 'success_hope':     return { text: '乘希望而为', color: '#fbbf24', severity: 'success' }
    case 'success_fear':     return { text: '带着恐惧成功', color: '#f97316', severity: 'partial' }
    case 'failure_hope':     return { text: '失败，但保有希望', color: '#60a5fa', severity: 'failure' }
    case 'failure_fear':     return { text: '带着恐惧失败', color: '#ef4444', severity: 'fumble' }
  }
}

export function dhGetRollActions(entity: Entity): RollAction[] {
  if (!entity.ruleData) return []
  const attrs: [string, string][] = [
    ['agility', '敏捷'], ['strength', '力量'], ['finesse', '精巧'],
    ['instinct', '本能'], ['presence', '风采'], ['knowledge', '知识'],
  ]
  return attrs.map(([key, name]) => ({
    id: key, name: `${name}检定`, formula: `2d12+@${key}`, targetAttributeKey: key,
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
