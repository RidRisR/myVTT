import type { VTTPlugin } from '@myvtt/sdk'
import { cosmeticDiceAnimationStep } from './diceAnimation'

export const daggerheartCosmeticPlugin: VTTPlugin = {
  id: 'daggerheart-cosmetic',
  onActivate(sdk) {
    sdk.addStep('roll', {
      id: 'cos:dice-animation',
      after: 'dh:judge',
      run: cosmeticDiceAnimationStep,
    })
  },
}
