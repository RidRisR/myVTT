import type React from 'react'
import type { VTTPlugin } from '../../src/rules/types'
import { HelloPanel } from './HelloPanel'
import { VignetteLayer } from './VignetteLayer'

export const pocUIPlugin: VTTPlugin = {
  id: 'poc-ui',
  onActivate(sdk) {
    sdk.ui.registerComponent({
      id: 'poc-ui.hello',
      component: HelloPanel as React.ComponentType<{ sdk: unknown }>,
      defaultSize: { width: 240, height: 140 },
    })
    sdk.ui.registerLayer({
      id: 'poc-ui.vignette',
      zLayer: 'above-canvas',
      component: VignetteLayer,
    })
  },
}
