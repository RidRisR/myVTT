// src/ui-system/regionTypes.ts

/** Anchor point relative to viewport */
export type AnchorPoint =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

/** 9-point grid origin for programmatic resize. Controls which point stays fixed. */
export type ResizeOrigin =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

/** Region z-order layer grouping */
export type RegionLayer = 'background' | 'standard' | 'overlay'

/** Viewport dimensions */
export interface Viewport {
  width: number
  height: number
}

/** Layout entry using anchor-based positioning (replaces legacy {x, y} LayoutEntry) */
export interface RegionLayoutEntry {
  anchor: AnchorPoint
  offsetX: number
  offsetY: number
  width: number
  height: number
  zOrder: number
  visible?: boolean
  /** Which point stays fixed during programmatic resize. Defaults to anchor behavior (no compensation). */
  resizeOrigin?: ResizeOrigin
  /** Pure serializable data only — no function form (see spec §12.13) */
  instanceProps?: Record<string, unknown>
}

/** Layout config: maps instance keys to layout entries */
export type RegionLayoutConfig = Record<string, RegionLayoutEntry>

/** On-demand instance descriptor (ephemeral, stored in layoutStore, not persisted) */
export interface OnDemandInstance {
  regionId: string
  instanceKey: string
  instanceProps: Record<string, unknown>
  zOrder: number
}
