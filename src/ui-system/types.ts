// src/ui-system/types.ts
import type React from 'react'
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

export interface ILayoutSDK {
  /** 组件从自身的 onMouseDown 调用，发起面板位置拖动（仅 play 模式注入） */
  startDrag(e: React.MouseEvent): void
}

export interface IComponentSDK {
  data: IDataSDK
  workflow: IWorkflowRunner
  context: ComponentContext
  /** play 模式且面板可拖动时注入；edit 模式下系统浮层接管，不注入 */
  layout?: ILayoutSDK
}

export interface ComponentProps {
  sdk: IComponentSDK
}

export interface LayerProps {
  layoutMode: 'play' | 'edit'
}
