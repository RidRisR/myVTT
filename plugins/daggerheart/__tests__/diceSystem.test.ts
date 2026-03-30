// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { dhEvaluateRoll, dhGetJudgmentDisplay } from '../diceSystem'

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
