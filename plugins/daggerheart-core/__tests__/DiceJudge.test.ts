import { describe, it, expect } from 'vitest'
import { DiceJudge } from '../DiceJudge'
import type { JudgmentResult } from '@myvtt/sdk'

type DaggerheartJudgment = Extract<JudgmentResult, { type: 'daggerheart' }>

/** Narrow helper — evaluate always returns the daggerheart variant */
function evaluateDH(judge: DiceJudge, rolls: number[][], total: number, dc: number) {
  return judge.evaluate(rolls, total, dc) as DaggerheartJudgment | null
}

describe('DiceJudge', () => {
  const judge = new DiceJudge()

  describe('evaluate', () => {
    it('returns critical_success when hope === fear', () => {
      const result = evaluateDH(judge, [[6, 6]], 12, 12)
      expect(result?.outcome).toBe('critical_success')
    })

    it('returns success_hope when total >= dc and hope > fear', () => {
      const result = evaluateDH(judge, [[8, 5]], 13, 12)
      expect(result?.outcome).toBe('success_hope')
      expect(result?.hopeDie).toBe(8)
      expect(result?.fearDie).toBe(5)
    })

    it('returns success_fear when total >= dc and fear > hope', () => {
      const result = evaluateDH(judge, [[4, 9]], 13, 12)
      expect(result?.outcome).toBe('success_fear')
    })

    it('returns failure_hope when total < dc and hope > fear', () => {
      const result = evaluateDH(judge, [[5, 3]], 8, 12)
      expect(result?.outcome).toBe('failure_hope')
    })

    it('returns failure_fear when total < dc and fear > hope', () => {
      const result = evaluateDH(judge, [[3, 5]], 8, 12)
      expect(result?.outcome).toBe('failure_fear')
    })

    it('returns null for empty rolls', () => {
      expect(judge.evaluate([], 0, 12)).toBeNull()
    })

    it('returns null for rolls with fewer than 2 dice', () => {
      expect(judge.evaluate([[5]], 5, 12)).toBeNull()
    })

    it('uses provided DC instead of default', () => {
      const successResult = evaluateDH(judge, [[5, 3]], 8, 7)
      expect(successResult?.outcome).toBe('success_hope')

      const failResult = evaluateDH(judge, [[5, 3]], 8, 12)
      expect(failResult?.outcome).toBe('failure_hope')
    })
  })

  describe('getDisplay', () => {
    it('returns correct display for critical_success', () => {
      const result = judge.evaluate([[6, 6]], 12, 12)!
      const display = judge.getDisplay(result)
      expect(display.severity).toBe('critical')
      expect(display.color).toBe('#a78bfa')
    })

    it('returns correct display for failure_fear', () => {
      const result = judge.evaluate([[3, 5]], 8, 12)!
      const display = judge.getDisplay(result)
      expect(display.severity).toBe('fumble')
      expect(display.color).toBe('#ef4444')
    })
  })
})
