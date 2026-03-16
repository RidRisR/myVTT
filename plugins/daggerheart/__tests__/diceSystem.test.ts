// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  dhEvaluateRoll,
  dhGetDieStyles,
  dhGetJudgmentDisplay,
  dhGetRollActions,
  rollCommands,
} from '../diceSystem'
import { makeEntity } from '../../../src/__test-utils__/fixtures'
import type { DHRuleData } from '../types'

function asDH(r: ReturnType<typeof dhEvaluateRoll>) {
  expect(r).not.toBeNull()
  const result = r as NonNullable<typeof r>
  expect(result.type).toBe('daggerheart')
  return result as Extract<typeof result, { type: 'daggerheart' }>
}

describe('dhEvaluateRoll', () => {
  it('returns null if rolls is empty', () => {
    expect(dhEvaluateRoll([], 0)).toBeNull()
  })
  it('returns null if first group has fewer than 2 values', () => {
    expect(dhEvaluateRoll([[7]], 7)).toBeNull()
  })
  it('critical_success: tied dice regardless of total (ties override DC)', () => {
    expect(asDH(dhEvaluateRoll([[7, 7]], 14)).outcome).toBe('critical_success')
    expect(asDH(dhEvaluateRoll([[5, 5]], 8)).outcome).toBe('critical_success') // below DC 12
  })
  it('success_hope: hope > fear, total >= 12', () => {
    const r = asDH(dhEvaluateRoll([[8, 5]], 13))
    expect(r.outcome).toBe('success_hope')
    expect(r.hopeDie).toBe(8)
    expect(r.fearDie).toBe(5)
  })
  it('success_fear: fear > hope, total >= 12', () => {
    expect(asDH(dhEvaluateRoll([[4, 9]], 13)).outcome).toBe('success_fear')
  })
  it('failure_hope: hope > fear, total < 12', () => {
    expect(asDH(dhEvaluateRoll([[7, 3]], 8)).outcome).toBe('failure_hope')
  })
  it('failure_fear: fear > hope, total < 12', () => {
    expect(asDH(dhEvaluateRoll([[3, 6]], 7)).outcome).toBe('failure_fear')
  })
})

describe('dhGetDieStyles', () => {
  it('returns empty for non-DH rolls', () => {
    expect(dhGetDieStyles([[7]])).toEqual([])
  })
  it('marks index 0 as Hope (gold) and index 1 as Fear (red)', () => {
    const styles = dhGetDieStyles([[8, 5]])
    expect(styles).toHaveLength(2)
    expect(styles[0]?.dieIndex).toBe(0)
    expect(styles[0]?.label).toBe('希望')
    expect(styles[0]?.color).toBe('#fbbf24')
    expect(styles[1]?.dieIndex).toBe(1)
    expect(styles[1]?.label).toBe('恐惧')
    expect(styles[1]?.color).toBe('#dc2626')
  })
})

describe('dhGetJudgmentDisplay', () => {
  it('critical severity for critical_success', () => {
    expect(
      dhGetJudgmentDisplay({
        type: 'daggerheart',
        hopeDie: 7,
        fearDie: 7,
        outcome: 'critical_success',
      }).severity,
    ).toBe('critical')
  })
  it('success for success_hope', () => {
    expect(
      dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 8, fearDie: 5, outcome: 'success_hope' })
        .severity,
    ).toBe('success')
  })
  it('partial for success_fear', () => {
    expect(
      dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 4, fearDie: 9, outcome: 'success_fear' })
        .severity,
    ).toBe('partial')
  })
  it('failure for failure_hope', () => {
    expect(
      dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 7, fearDie: 3, outcome: 'failure_hope' })
        .severity,
    ).toBe('failure')
  })
  it('fumble for failure_fear', () => {
    expect(
      dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 3, fearDie: 6, outcome: 'failure_fear' })
        .severity,
    ).toBe('fumble')
  })
})

describe('dhGetRollActions', () => {
  it('returns empty for entity with no ruleData', () => {
    expect(dhGetRollActions(makeEntity({ ruleData: null }))).toEqual([])
  })
  it('returns 6 actions with 2d12+@attr formulas', () => {
    const entity = makeEntity({
      ruleData: {
        agility: 2,
        strength: 1,
        finesse: 3,
        instinct: 0,
        presence: 1,
        knowledge: 2,
        tier: 1,
        proficiency: 1,
        className: '',
        ancestry: '',
        hp: { current: 0, max: 0 },
        stress: { current: 0, max: 0 },
        hope: 0,
        armor: 0,
      } satisfies DHRuleData,
    })
    const actions = dhGetRollActions(entity)
    expect(actions).toHaveLength(6)
    expect(actions.every((a) => a.formula.startsWith('2d12+@'))).toBe(true)
  })
})

describe('rollCommands', () => {
  it('daggerheart:dd resolveFormula with no modifier gives 2d12', () => {
    expect(rollCommands['daggerheart:dd']?.resolveFormula()).toBe('2d12')
    expect(rollCommands['daggerheart:dd']?.resolveFormula('')).toBe('2d12')
  })
  it('daggerheart:dd resolveFormula with +2 gives 2d12+2', () => {
    expect(rollCommands['daggerheart:dd']?.resolveFormula('+2')).toBe('2d12+2')
  })
  it('daggerheart:dd resolveFormula with @agility stays as-is', () => {
    expect(rollCommands['daggerheart:dd']?.resolveFormula('+@agility')).toBe('2d12+@agility')
  })
})
