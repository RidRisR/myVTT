// plugins/daggerheart/diceSystem.ts
import type { JudgmentResult, JudgmentDisplay, DaggerheartOutcome } from '@myvtt/sdk'

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
