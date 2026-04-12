// plugins/daggerheart-core/rollConfigUtils.ts
import type { RollConfig, DiceGroup, DualityDiceConfig } from './rollTypes'

/** 公式栏用的带注释 token */
export interface FormulaToken {
  type: 'dice' | 'modifier' | 'constant' | 'op'
  text: string
  source?: string
}

function dualityToTerms(d: DualityDiceConfig): string {
  if (d.hopeFace === d.fearFace) return `2d${d.hopeFace}`
  return `1d${d.hopeFace}+1d${d.fearFace}`
}

function diceGroupToTerm(g: DiceGroup): string {
  let s = `${g.count}d${g.sides}`
  if (g.keep) s += `k${g.keep.mode === 'high' ? 'h' : 'l'}${g.keep.count}`
  return s
}

export function rollConfigToFormula(config: RollConfig): string {
  const parts: string[] = []

  if (config.dualityDice) {
    parts.push(dualityToTerms(config.dualityDice))
  }

  for (const g of config.diceGroups) {
    const term = diceGroupToTerm(g)
    parts.push(g.operator === '-' ? `-${term}` : `+${term}`)
  }

  const modTotal = config.modifiers.reduce((sum, m) => sum + m.value, 0) + config.constantModifier

  if (modTotal > 0) parts.push(`+${modTotal}`)
  else if (modTotal < 0) parts.push(`${modTotal}`)

  // Join and clean up leading '+'
  return parts.join('').replace(/^\+/, '')
}

export function rollConfigToFormulaTokens(config: RollConfig): FormulaToken[] {
  const tokens: FormulaToken[] = []

  if (config.dualityDice) {
    tokens.push({
      type: 'dice',
      text: dualityToTerms(config.dualityDice),
      source: 'duality',
    })
  }

  for (const g of config.diceGroups) {
    tokens.push({ type: 'op', text: g.operator === '-' ? '-' : '+' } as FormulaToken)
    tokens.push({
      type: 'dice',
      text: diceGroupToTerm(g),
      source: g.label,
    })
  }

  for (const m of config.modifiers) {
    tokens.push({ type: 'op', text: m.value >= 0 ? '+' : '-' })
    tokens.push({
      type: 'modifier',
      text: `${Math.abs(m.value)}`,
      source: m.label,
    })
  }

  if (config.constantModifier !== 0) {
    tokens.push({ type: 'op', text: config.constantModifier > 0 ? '+' : '-' })
    tokens.push({
      type: 'constant',
      text: `${Math.abs(config.constantModifier)}`,
    })
  }

  // Remove leading '+' op
  if (tokens.length > 0 && tokens[0].type === 'op' && tokens[0].text === '+') {
    tokens.shift()
  }

  return tokens
}
