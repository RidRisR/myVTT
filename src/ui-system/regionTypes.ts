// src/ui-system/regionTypes.ts

/** Anchor point relative to viewport */
export type AnchorPoint = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

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
