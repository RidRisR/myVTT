import { describe, expect, it } from 'vitest'
import { mergeTemplateConfigAfterEditorRoundTrip } from './rollTemplateUtils'
import type { DHRollTemplateConfig } from '../daggerheart/types'
import type { RollConfig } from './rollTypes'

describe('mergeTemplateConfigAfterEditorRoundTrip', () => {
  it('preserves missing experience refs during template config edits', () => {
    const originalConfig: DHRollTemplateConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [],
      modifiers: [
        { type: 'attribute', attributeKey: 'agility' },
        {
          type: 'experience',
          experienceKey: 'missing-exp',
          labelSnapshot: 'Old Expertise',
          modifierSnapshot: 2,
        },
      ],
      constantModifier: 0,
      sideEffects: [],
      dc: 12,
    }

    const editedRollConfig: RollConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [{ sides: 8, count: 1, operator: '+', label: 'd8' }],
      modifiers: [{ source: 'attribute:agility', label: '敏捷', value: 3 }],
      constantModifier: 1,
      sideEffects: [],
      dc: 12,
    }

    const merged = mergeTemplateConfigAfterEditorRoundTrip(originalConfig, editedRollConfig, {
      items: [],
    })

    expect(merged.modifiers).toEqual([
      { type: 'attribute', attributeKey: 'agility', labelSnapshot: '敏捷' },
      {
        type: 'experience',
        experienceKey: 'missing-exp',
        labelSnapshot: 'Old Expertise',
        modifierSnapshot: 2,
      },
    ])
    expect(merged.constantModifier).toBe(1)
    expect(merged.diceGroups).toEqual([{ sides: 8, count: 1, operator: '+', label: 'd8' }])
  })
})
