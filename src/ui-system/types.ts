// src/ui-system/types.ts
import type React from 'react'
import type { IWorkflowRunner, IDataReader } from '../workflow/types'
import type { Entity } from '../shared/entityTypes'
import type { ComponentTypeMap } from '../shared/componentTypes'
import type { GameLogEntry } from '../shared/logTypes'
import type { AnchorPoint } from './regionTypes'

export interface DnDPayload {
  /** Identifies the type of dragged item; drop zones use this for filtering */
  type: string
  /** Reference semantics — typically an id or small descriptor, not full data copy */
  data: unknown
}

export type {
  ZLayer,
  PanelType,
  DefaultPlacement,
  ComponentDef,
  LayerDef,
  RegionDef,
  IUIRegistrationSDK,
} from './registrationTypes'
export type {
  AnchorPoint,
  RegionLayer,
  Viewport,
  RegionLayoutEntry,
  RegionLayoutConfig,
} from './regionTypes'
export type {
  InputResult,
  InputHandlerProps,
  InputHandlerDef,
  RequestInputOptions,
} from './inputHandlerTypes'

/** Session snapshot passed to instanceProps factory functions */
export interface SessionSnapshot {
  selection: string[]
}

/** Static props or a factory that receives current session state */
export type InstancePropsOrFactory =
  | Record<string, unknown>
  | ((session: SessionSnapshot) => Record<string, unknown>)

export interface LayoutEntry {
  x: number
  y: number
  width: number
  height: number
  zOrder: number
  visible?: boolean
  instanceProps?: InstancePropsOrFactory
}

// key format: "<componentId>#<instance>" e.g. "poc-ui.hello#1"
export type LayoutConfig = Record<string, LayoutEntry>

export interface ComponentContext {
  instanceProps: Record<string, unknown>
  role: 'GM' | 'Player'
  layoutMode: 'play' | 'edit'
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

// ── Reactive data hooks (React component use only, not for workflows) ──

/** Reactive data subscription hooks — only available on IComponentSDK, not WorkflowContext */
export interface IReactiveDataSDK {
  /** Subscribe to a single entity. Re-renders on change. */
  useEntity(entityId: string): Entity | undefined
  /** Subscribe to a component on an entity. Re-renders on change. Known keys auto-infer type. */
  useComponent<K extends keyof ComponentTypeMap>(
    entityId: string,
    key: K,
  ): ComponentTypeMap[K] | undefined
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- fallback overload for plugin-defined keys not in ComponentTypeMap
  useComponent<T = unknown>(entityId: string, key: string): T | undefined
  /** Subscribe to entities matching a query. Re-renders when result set changes. */
  useQuery(spec: { has?: string[] }): Entity[]
}

/** Log hook result — entries + set of IDs that arrived after component mount */
export interface LogEntriesResult {
  entries: GameLogEntry[]
  newIds: ReadonlySet<string>
}

/** Awareness hook: reactive peer state map */
export type UsePeersFn = <T>(channel: {
  readonly key: string
  readonly __phantom?: T
}) => ReadonlyMap<string, T>

export interface IComponentSDK {
  read: IDataReader
  /** Reactive data hooks for React components */
  data: IReactiveDataSDK
  workflow: IWorkflowRunner
  context: ComponentContext
  /** play 模式下注入；edit 模式下系统浮层接管所有交互，不注入 */
  interaction?: IInteractionSDK
  /** AwarenessManager channel API for ephemeral real-time state */
  awareness: {
    subscribe<T>(
      channel: { readonly key: string; readonly __phantom?: T },
      handler: (seatId: string, state: T | null) => void,
    ): () => void
    broadcast<T>(channel: { readonly key: string; readonly __phantom?: T }, data: T): void
    clear(channel: { readonly key: string }): void
    /** React hook: subscribe to all peers' state on a channel */
    usePeers: UsePeersFn
  }
  /** Log stream subscription for reacting to game log entries */
  log: {
    subscribe(pattern: string, handler: (entry: unknown) => void): () => void
    /** React hook: get matching log entries with newness tracking */
    useEntries(pattern: string, options?: { limit?: number }): LogEntriesResult
  }
  /** Panel management API */
  ui: {
    openPanel(
      componentId: string,
      instanceProps?: Record<string, unknown>,
      position?: { anchor: AnchorPoint; offsetX?: number; offsetY?: number },
    ): string
    closePanel(instanceKey: string): void
  }
}

export interface ComponentProps {
  sdk: IComponentSDK
}

export interface LayerProps {
  layoutMode: 'play' | 'edit'
}

/** Extended SDK for Region components — adds resize and portal support */
export interface IRegionSDK extends Omit<IComponentSDK, 'ui'> {
  ui: {
    openPanel(
      regionId: string,
      instanceProps?: Record<string, unknown>,
      position?: { anchor: AnchorPoint; offsetX?: number; offsetY?: number },
    ): string
    closePanel(instanceKey: string): void
    /** Dynamically resize this region. Clamped to minSize. */
    resize(size: { width?: number; height?: number }): void
    /** Get the portal container for this region (for Radix/floating UI) */
    getPortalContainer(): HTMLElement
  }
}
