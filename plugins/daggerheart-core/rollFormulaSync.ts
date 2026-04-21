import { tokenizeExpression, type DiceTerm } from '../../src/shared/diceUtils'
import type { DiceGroup, RollConfig } from './rollTypes'

function keepDropToKeep(term: Extract<DiceTerm, { type: 'dice' }>): DiceGroup['keep'] {
  const keepDrop = term.keepDrop
  if (!keepDrop) return undefined

  switch (keepDrop.mode) {
    case 'kh':
      return { mode: 'high', count: keepDrop.count }
    case 'kl':
      return { mode: 'low', count: keepDrop.count }
    case 'dh':
      return { mode: 'low', count: term.count - keepDrop.count }
    case 'dl':
      return { mode: 'high', count: term.count - keepDrop.count }
  }
}

function toDiceGroup(term: Extract<DiceTerm, { type: 'dice' }>): DiceGroup {
  return {
    sides: term.sides,
    count: term.count,
    operator: term.sign === -1 ? '-' : '+',
    keep: keepDropToKeep(term),
    label: `d${term.sides}`,
  }
}

function parseLeadingDuality(terms: DiceTerm[]): {
  dualityDice: RollConfig['dualityDice']
  remainingTerms: DiceTerm[]
} {
  const [first, second, ...rest] = terms

  if (first?.type === 'dice' && first.sign === 1 && first.count === 2 && !first.keepDrop) {
    return {
      dualityDice: { hopeFace: first.sides, fearFace: first.sides },
      remainingTerms: terms.slice(1),
    }
  }

  if (
    first?.type === 'dice' &&
    second?.type === 'dice' &&
    first.sign === 1 &&
    second.sign === 1 &&
    first.count === 1 &&
    second.count === 1 &&
    !first.keepDrop &&
    !second.keepDrop
  ) {
    return {
      dualityDice: { hopeFace: first.sides, fearFace: second.sides },
      remainingTerms: rest,
    }
  }

  return { dualityDice: null, remainingTerms: terms }
}

export function parseFormulaToRollConfig(formula: string): RollConfig | null {
  const terms = tokenizeExpression(formula)
  if (!terms) return null

  const { dualityDice, remainingTerms } = parseLeadingDuality(terms)
  const diceGroups: DiceGroup[] = []
  let constantModifier = 0

  for (const term of remainingTerms) {
    if (term.type === 'constant') {
      constantModifier += term.sign * term.value
      continue
    }
    diceGroups.push(toDiceGroup(term))
  }

  return {
    dualityDice,
    diceGroups,
    modifiers: [],
    constantModifier,
    sideEffects: [],
    applyOutcomeEffects: true,
  }
}
