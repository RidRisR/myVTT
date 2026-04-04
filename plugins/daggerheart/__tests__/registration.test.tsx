// @vitest-environment jsdom
// Integration test: verifies daggerheart plugin registers correctly with the core registry
import { describe, it, expect } from 'vitest'
import { getRulePlugin } from '../../../src/rules/registry'
import { makeEntity } from '../../../src/__test-utils__/fixtures'
import { DH_KEYS } from '../types'

describe('daggerheartPlugin registration', () => {
  it('getRulePlugin returns daggerheart after registration', () => {
    const plugin = getRulePlugin('daggerheart')
    expect(plugin.id).toBe('daggerheart')
  })

  it('adapters.getMainResource returns HP', () => {
    const plugin = getRulePlugin('daggerheart')
    const entity = makeEntity({
      components: {
        'core:identity': { name: 'R', imageUrl: '', color: '' },
        [DH_KEYS.health]: { current: 12, max: 20 },
        [DH_KEYS.stress]: { current: 0, max: 6 },
        [DH_KEYS.attributes]: {
          agility: 2,
          strength: 1,
          finesse: 3,
          instinct: 0,
          presence: 1,
          knowledge: 2,
        },
        [DH_KEYS.meta]: { tier: 1, proficiency: 1, className: 'R', ancestry: 'E' },
        [DH_KEYS.extras]: { hope: 2, armor: 1 },
      },
    })
    expect(plugin.adapters.getMainResource(entity)?.current).toBe(12)
  })
})
