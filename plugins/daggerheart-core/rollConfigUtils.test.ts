// plugins/daggerheart-core/rollConfigUtils.test.ts
import { describe, it, expect } from 'vitest'
import {
  rollConfigToFormula,
  rollConfigToFormulaTokens,
  buildDiceSpecs,
  assembleRollResult,
} from './rollConfigUtils'
import type { RollConfig } from './rollTypes'

const BASE_CONFIG: RollConfig = {
  dualityDice: { hopeFace: 12, fearFace: 12 },
  diceGroups: [],
  modifiers: [
    { source: 'attribute:agility', label: '敏捷', value: 3 },
    { source: 'experience:stealth', label: '潜行', value: 2 },
  ],
  constantModifier: 2,
  sideEffects: [],
}

describe('rollConfigToFormula', () => {
  it('generates formula string from basic config', () => {
    expect(rollConfigToFormula(BASE_CONFIG)).toBe('2d12+7')
  })

  it('handles swapped duality dice faces', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      dualityDice: { hopeFace: 20, fearFace: 12 },
      modifiers: [],
      constantModifier: 0,
    }
    expect(rollConfigToFormula(config)).toBe('1d20+1d12')
  })

  it('handles extra dice groups with operators', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      diceGroups: [
        { sides: 6, count: 1, operator: '+', label: '优势' },
        { sides: 4, count: 1, operator: '-' },
      ],
    }
    expect(rollConfigToFormula(config)).toBe('2d12+1d6-1d4+7')
  })

  it('handles keep modifiers', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      diceGroups: [{ sides: 6, count: 3, operator: '+', keep: { mode: 'high', count: 2 } }],
      modifiers: [],
      constantModifier: 0,
    }
    expect(rollConfigToFormula(config)).toBe('2d12+3d6kh2')
  })

  it('handles no duality dice', () => {
    const config: RollConfig = {
      dualityDice: null,
      diceGroups: [{ sides: 20, count: 1, operator: '+' }],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    expect(rollConfigToFormula(config)).toBe('1d20')
  })

  it('handles negative constant modifier', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      modifiers: [],
      constantModifier: -3,
    }
    expect(rollConfigToFormula(config)).toBe('2d12-3')
  })

  it('omits zero constant modifier', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      modifiers: [],
      constantModifier: 0,
    }
    expect(rollConfigToFormula(config)).toBe('2d12')
  })

  it('returns empty string for empty config', () => {
    const config: RollConfig = {
      dualityDice: null,
      diceGroups: [],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    expect(rollConfigToFormula(config)).toBe('')
  })

  it('handles negative modifier values', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      modifiers: [
        { source: 'attr:a', label: 'A', value: 3 },
        { source: 'attr:b', label: 'B', value: -5 },
      ],
      constantModifier: 0,
    }
    // modTotal = 3 + (-5) = -2
    expect(rollConfigToFormula(config)).toBe('2d12-2')
  })
})

describe('rollConfigToFormulaTokens', () => {
  it('produces annotated tokens for formula bar display', () => {
    const tokens = rollConfigToFormulaTokens(BASE_CONFIG)
    expect(tokens).toEqual([
      { type: 'dice', text: '2d12', source: 'duality' },
      { type: 'op', text: '+' },
      { type: 'modifier', text: '3', source: '敏捷' },
      { type: 'op', text: '+' },
      { type: 'modifier', text: '2', source: '潜行' },
      { type: 'op', text: '+' },
      { type: 'constant', text: '2' },
    ])
  })
})

describe('buildDiceSpecs', () => {
  it('converts RollConfig to DiceSpec array for serverRoll', () => {
    const config: RollConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [
        { sides: 6, count: 2, operator: '+' },
        { sides: 4, count: 1, operator: '-' },
      ],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    const specs = buildDiceSpecs(config)
    // 二元骰拆为两个独立 DiceSpec（因为面数可能不同）
    expect(specs).toEqual([
      { sides: 12, count: 1 }, // hope die
      { sides: 12, count: 1 }, // fear die
      { sides: 6, count: 2 }, // extra group 1
      { sides: 4, count: 1 }, // extra group 2
    ])
  })

  it('handles swapped faces', () => {
    const config: RollConfig = {
      dualityDice: { hopeFace: 20, fearFace: 12 },
      diceGroups: [],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    expect(buildDiceSpecs(config)).toEqual([
      { sides: 20, count: 1 },
      { sides: 12, count: 1 },
    ])
  })

  it('handles no duality dice', () => {
    const config: RollConfig = {
      dualityDice: null,
      diceGroups: [{ sides: 20, count: 1, operator: '+' }],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    expect(buildDiceSpecs(config)).toEqual([{ sides: 20, count: 1 }])
  })
})

describe('assembleRollResult', () => {
  it('assembles server rolls into RollExecutionResult', () => {
    const config: RollConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [{ sides: 6, count: 2, operator: '+', keep: { mode: 'high', count: 1 } }],
      modifiers: [{ source: 'attr:agility', label: '敏捷', value: 3 }],
      constantModifier: 1,
      sideEffects: [],
    }
    // serverRoll returns number[][] — one sub-array per DiceSpec
    const serverRolls: number[][] = [
      [8], // hope die
      [5], // fear die
      [4, 6], // 2d6
    ]
    const result = assembleRollResult(config, serverRolls)

    expect(result.dualityRolls).toEqual([8, 5])
    expect(result.groupResults).toHaveLength(1)
    const gr0 = result.groupResults[0]
    expect(gr0?.allRolls).toEqual([4, 6])
    expect(gr0?.keptIndices).toEqual([1]) // keep high → index 1 (value 6)
    expect(gr0?.subtotal).toBe(6) // kept 6, operator '+'
    expect(result.modifierTotal).toBe(4) // 3 + 1
    // total = 8 + 5 + 6 + 4 = 23
    expect(result.total).toBe(23)
  })

  it('handles subtraction dice groups', () => {
    const config: RollConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [{ sides: 4, count: 1, operator: '-' }],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    const serverRolls: number[][] = [[10], [3], [2]]
    const result = assembleRollResult(config, serverRolls)
    // total = 10 + 3 - 2 = 11
    expect(result.total).toBe(11)
  })
})
