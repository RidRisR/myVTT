// plugins/daggerheart-core/rollConfigUtils.ts
import type { DiceSpec } from '../../src/shared/diceUtils'
import type { RollConfig, DiceGroup, DualityDiceConfig, RollExecutionResult, DiceGroupResult } from './rollTypes'

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
  const first = tokens[0]
  if (first && first.type === 'op' && first.text === '+') {
    tokens.shift()
  }

  return tokens
}

/** 将 RollConfig 转为 serverRoll 需要的 DiceSpec[] */
export function buildDiceSpecs(config: RollConfig): DiceSpec[] {
  const specs: DiceSpec[] = []

  if (config.dualityDice) {
    specs.push({ sides: config.dualityDice.hopeFace, count: 1 })
    specs.push({ sides: config.dualityDice.fearFace, count: 1 })
  }

  for (const g of config.diceGroups) {
    specs.push({ sides: g.sides, count: g.count })
  }

  return specs
}

/** 将 serverRoll 返回的原始结果 + RollConfig 组装为 RollExecutionResult */
export function assembleRollResult(
  config: RollConfig,
  serverRolls: number[][],
): RollExecutionResult {
  const expectedCount = (config.dualityDice ? 2 : 0) + config.diceGroups.length
  if (serverRolls.length !== expectedCount) {
    throw new Error(
      `assembleRollResult: expected ${expectedCount} roll arrays, got ${serverRolls.length}`,
    )
  }

  let idx = 0

  // 二元骰
  let dualityRolls: [number, number] | null = null
  let dualitySum = 0
  if (config.dualityDice) {
    const hopeDie = serverRolls[idx++]![0]!
    const fearDie = serverRolls[idx++]![0]!
    dualityRolls = [hopeDie, fearDie]
    dualitySum = hopeDie + fearDie
  }

  // 额外骰子组
  const groupResults: DiceGroupResult[] = []
  for (const g of config.diceGroups) {
    const allRolls = serverRolls[idx++]!
    const { keptIndices, subtotal } = applyKeepAndSum(allRolls, g)
    groupResults.push({ group: g, allRolls, keptIndices, subtotal })
  }

  // 修正值总和
  const modifierTotal =
    config.modifiers.reduce((sum, m) => sum + m.value, 0) + config.constantModifier

  // 最终总计
  const diceTotal = groupResults.reduce((sum, r) => sum + r.subtotal, 0)
  const total = dualitySum + diceTotal + modifierTotal

  return { dualityRolls, groupResults, modifierTotal, total }
}

function applyKeepAndSum(
  allRolls: number[],
  group: DiceGroup,
): { keptIndices: number[]; subtotal: number } {
  let keptIndices: number[]

  if (group.keep) {
    // 排序获取索引
    const indexed = allRolls.map((v, i) => ({ v, i }))
    if (group.keep.mode === 'high') {
      indexed.sort((a, b) => b.v - a.v)
    } else {
      indexed.sort((a, b) => a.v - b.v)
    }
    keptIndices = indexed
      .slice(0, group.keep.count)
      .map((x) => x.i)
      .sort((a, b) => a - b)
  } else {
    keptIndices = allRolls.map((_, i) => i)
  }

  const keptSum = keptIndices.reduce((sum, i) => sum + allRolls[i]!, 0)
  const subtotal = group.operator === '-' ? -keptSum : keptSum

  return { keptIndices, subtotal }
}
