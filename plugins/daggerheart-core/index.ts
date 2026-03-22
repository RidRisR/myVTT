// plugins/daggerheart-core/index.ts
import type { VTTPlugin } from '@myvtt/sdk'
import { registerDHCoreSteps } from './rollSteps'

export const daggerheartCorePlugin: VTTPlugin = {
  id: 'daggerheart-core',
  onActivate(sdk) {
    registerDHCoreSteps(sdk)
  },
}
