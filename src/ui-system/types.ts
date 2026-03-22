// src/ui-system/types.ts
import type { Entity } from '../shared/entityTypes'
import type { IWorkflowRunner } from '../workflow/types'

export type { ZLayer, ComponentDef, LayerDef, IUIRegistrationSDK } from './registrationTypes'

export interface LayoutEntry {
  x: number
  y: number
  width: number
  height: number
  visible?: boolean
  instanceProps?: Record<string, unknown>
}

// key format: "<componentId>#<instance>" e.g. "poc-ui.hello#1"
export type LayoutConfig = Record<string, LayoutEntry>

export interface ComponentContext {
  instanceProps: Record<string, unknown>
  role: 'GM' | 'Player'
  layoutMode: 'play' | 'edit'
}

export interface IDataSDK {
  entity(id: string): Entity | undefined
  entities(): Entity[]
}

export interface IComponentSDK {
  data: IDataSDK
  workflow: IWorkflowRunner
  context: ComponentContext
}

export interface ComponentProps {
  sdk: IComponentSDK
}

export interface LayerProps {
  layoutMode: 'play' | 'edit'
}
