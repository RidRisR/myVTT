import { describe, expect, it } from 'vitest'
import { parseFormulaToRollConfig } from './rollFormulaSync'

describe('parseFormulaToRollConfig', () => {
  it('parses d20+2 into a normal dice group with constant modifier', () => {
    expect(parseFormulaToRollConfig('1d20+2')).toMatchObject({
      dualityDice: null,
      diceGroups: [{ sides: 20, count: 1, operator: '+' }],
      constantModifier: 2,
      applyOutcomeEffects: true,
    })
  })

  it('parses 2d20kh1+2 into a keep-high dice group', () => {
    expect(parseFormulaToRollConfig('2d20kh1+2')).toMatchObject({
      dualityDice: null,
      diceGroups: [
        {
          sides: 20,
          count: 2,
          operator: '+',
          keep: { mode: 'high', count: 1 },
        },
      ],
      constantModifier: 2,
    })
  })

  it('parses a leading 2d12 term as duality dice', () => {
    expect(parseFormulaToRollConfig('2d12+3')).toMatchObject({
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [],
      constantModifier: 3,
    })
  })

  it('parses split duality dice faces written as 1d10+1d12', () => {
    expect(parseFormulaToRollConfig('1d10+1d12+1')).toMatchObject({
      dualityDice: { hopeFace: 10, fearFace: 12 },
      diceGroups: [],
      constantModifier: 1,
    })
  })

  it('converts drop syntax into equivalent keep syntax', () => {
    expect(parseFormulaToRollConfig('3d6dl1')).toMatchObject({
      dualityDice: null,
      diceGroups: [
        {
          sides: 6,
          count: 3,
          operator: '+',
          keep: { mode: 'high', count: 2 },
        },
      ],
    })
  })

  it('returns null for invalid expressions', () => {
    expect(parseFormulaToRollConfig('abc+1')).toBeNull()
  })
})
