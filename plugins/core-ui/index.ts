import type React from 'react'
import type { VTTPlugin } from '../../src/rules/types'
import { SessionInfoPanel } from './SessionInfoPanel'

export const coreUIPlugin: VTTPlugin = {
  id: 'core-ui',
  onActivate(sdk) {
    sdk.ui.registerComponent({
      id: 'core-ui.session-info',
      component: SessionInfoPanel as React.ComponentType<{ sdk: unknown }>,
      type: 'panel',
      defaultSize: { width: 200, height: 260 },
      defaultPlacement: {
        anchor: 'top-right',
        offsetX: 20,
        offsetY: 60,
      },
    })
  },
}
