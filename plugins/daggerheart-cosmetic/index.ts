import type { VTTPlugin } from '@myvtt/sdk'
import { cosmeticDiceAnimationStep } from './diceAnimation'

export const daggerheartCosmeticPlugin: VTTPlugin = {
  id: 'daggerheart-cosmetic',
  dependencies: ['daggerheart-core'],
  onActivate(sdk) {
    const dhActionCheck = sdk.getWorkflow('daggerheart-core:action-check')
    // Lifecycle-bound to judgment — if core plugin is deactivated, this step
    // is automatically cascade-removed
    sdk.attachStep(dhActionCheck, {
      id: 'cos:dice-animation',
      to: 'judge',
      readonly: true,
      critical: false,
      run: cosmeticDiceAnimationStep,
    })
  },
}
