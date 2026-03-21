import type { VTTPlugin } from '@myvtt/sdk'
import { rollWorkflow } from '@myvtt/sdk'
import { cosmeticDiceAnimationStep } from './diceAnimation'

export const daggerheartCosmeticPlugin: VTTPlugin = {
  id: 'daggerheart-cosmetic',
  dependencies: ['daggerheart-core'],
  onActivate(sdk) {
    // Lifecycle-bound to dh:judge — if core plugin is deactivated, this step
    // is automatically cascade-removed
    sdk.attachStep(rollWorkflow, {
      id: 'cos:dice-animation',
      to: 'dh:judge',
      critical: false,
      run: cosmeticDiceAnimationStep,
    })
  },
}
