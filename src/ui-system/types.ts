// src/ui-system/types.ts
import type React from 'react'
import type { Entity } from '../shared/entityTypes'
import type { IWorkflowRunner } from '../workflow/types'

export interface DnDPayload {
  /** Identifies the type of dragged item; drop zones use this for filtering */
  type: string
  /** Reference semantics — typically an id or small descriptor, not full data copy */
  data: unknown
}

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

export interface IDnDSDK {
  /**
   * Returns props to spread onto a draggable element.
   * Components must NOT use the HTML5 DnD API directly — always go through this method.
   */
  makeDraggable(payload: DnDPayload): React.HTMLAttributes<HTMLElement> & { draggable?: boolean }

  /**
   * Returns props to spread onto a drop zone element.
   * accept: [] means accept all types.
   * canDrop: synchronous predicate for real-time visual feedback (called on dragover).
   * onDrop: called with the payload on successful drop — trigger workflow here.
   */
  makeDropZone(spec: {
    accept: string[]
    canDrop?: (payload: DnDPayload) => boolean
    /** Called when a drag enters the zone. canAccept reflects canDrop result. */
    onEnter?: (canAccept: boolean) => void
    /** Called when the drag leaves the zone. */
    onLeave?: () => void
    onDrop: (payload: DnDPayload) => void
  }): React.HTMLAttributes<HTMLElement>
}

export interface ILayoutSDK {
  /** 组件从自身的 onMouseDown 调用，发起面板位置拖动（仅 play 模式注入） */
  startDrag(e: React.MouseEvent): void
}

/**
 * Play-mode UI interaction primitives.
 * Injected as a whole in play mode; absent in edit mode (system overlay takes over).
 */
export interface IInteractionSDK {
  layout: ILayoutSDK
  dnd: IDnDSDK
}

export interface IComponentSDK {
  data: IDataSDK
  workflow: IWorkflowRunner
  context: ComponentContext
  /** play 模式下注入；edit 模式下系统浮层接管所有交互，不注入 */
  interaction?: IInteractionSDK
}

export interface ComponentProps {
  sdk: IComponentSDK
}

export interface LayerProps {
  layoutMode: 'play' | 'edit'
}
