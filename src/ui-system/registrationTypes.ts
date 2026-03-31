// src/ui-system/registrationTypes.ts
// No imports from workflow/ — this file is imported by workflow/types.ts
import type React from 'react'
import type { InputHandlerDef } from './inputHandlerTypes'

export type ZLayer = 'below-canvas' | 'above-canvas' | 'above-ui'

/** Panel z-order grouping: background < panel < overlay */
export type PanelType = 'background' | 'panel' | 'overlay'

export interface DefaultPlacement {
  anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  offsetX?: number
  offsetY?: number
  modes?: ('narrative' | 'tactical')[]
}

export interface ComponentDef {
  id: string
  // sdk typed as unknown: avoids importing IComponentSDK here (which would create a
  // cycle: types.ts → workflow/types.ts → registrationTypes.ts → types.ts).
  // Plugin registration sites cast their component: `MyPanel as React.ComponentType<{ sdk: unknown }>`.
  component: React.ComponentType<{ sdk: unknown }>
  type: PanelType
  defaultSize: { width: number; height: number }
  minSize?: { width: number; height: number }
  defaultPlacement?: DefaultPlacement
  chromeVisible?: boolean // default true; false = chrome hidden in play mode
}

export interface LayerDef {
  id: string
  zLayer: ZLayer
  component: React.ComponentType<{ layoutMode: 'play' | 'edit' }>
  pointerEvents?: boolean // default false
}

export interface IUIRegistrationSDK {
  registerComponent(def: ComponentDef): void
  registerLayer(def: LayerDef): void
  registerRenderer(
    surface: string,
    type: string,
    // entry typed as unknown: avoids importing GameLogEntry here (circular dep).
    // Plugin registration sites cast: `MyRenderer as React.ComponentType<{ entry: unknown; isNew?: boolean }>`.
    renderer: React.ComponentType<{ entry: unknown; isNew?: boolean }>,
  ): void
  registerRenderer<T>(
    point: { readonly surface: string; readonly type: string; readonly __phantom?: T },
    value: T,
  ): void
  registerInputHandler(inputType: string, def: InputHandlerDef): void
}
