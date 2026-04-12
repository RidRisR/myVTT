import { describe, expect, it } from 'vitest'
import {
  materializeRollConfigFromTemplate,
  mergeTemplateConfigAfterEditorRoundTrip,
  normalizeExperiences,
} from './rollTemplateUtils'
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
      applyOutcomeEffects: true,
    }

    const editedRollConfig: RollConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [{ sides: 8, count: 1, operator: '+', label: 'd8' }],
      modifiers: [{ source: 'attribute:agility', label: '敏捷', value: 3 }],
      constantModifier: 1,
      sideEffects: [],
      dc: 12,
      applyOutcomeEffects: true,
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

  it('normalizes legacy experience keys before materializing template modifiers', () => {
    const config: DHRollTemplateConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [],
      modifiers: [{ type: 'experience', experienceKey: 'stealth' }],
      constantModifier: 0,
      sideEffects: [],
      dc: 12,
      applyOutcomeEffects: true,
    }

    const experiences = normalizeExperiences({
      items: [{ key: '', name: 'Stealth', modifier: 2 }],
    })

    const rollConfig = materializeRollConfigFromTemplate(
      config,
      {
        agility: 0,
        strength: 0,
        finesse: 0,
        instinct: 0,
        presence: 0,
        knowledge: 0,
      },
      experiences,
    )

    expect(rollConfig.modifiers).toEqual([
      { source: 'experience:stealth', label: 'Stealth', value: 2 },
    ])
  })
})
