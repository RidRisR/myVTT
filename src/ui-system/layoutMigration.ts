// src/ui-system/layoutMigration.ts
import type { RegionLayoutEntry, RegionLayoutConfig, Viewport } from './regionTypes'
import { inferAnchor, anchorBase } from './layoutEngine'

/** Legacy LayoutEntry shape (pre-Region Model) */
export interface LegacyLayoutEntry {
  x: number
  y: number
  width: number
  height: number
  zOrder: number
  visible?: boolean
  instanceProps?: Record<string, unknown> | ((...args: unknown[]) => Record<string, unknown>)
}

/** Type guard: detect legacy {x, y} format vs new {anchor} format */
export function isLegacyEntry(entry: unknown): entry is LegacyLayoutEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'x' in entry &&
    'y' in entry &&
    !('anchor' in entry)
  )
}

/** Convert a single legacy entry to anchor-based format */
export function migrateLayoutEntry(old: LegacyLayoutEntry, viewport: Viewport): RegionLayoutEntry {
  const centerX = old.x + old.width / 2
  const centerY = old.y + old.height / 2
  const anchor = inferAnchor({ x: centerX, y: centerY }, viewport)
  const base = anchorBase(anchor, { width: old.width, height: old.height }, viewport)

  return {
    anchor,
    offsetX: old.x - base.x,
    offsetY: old.y - base.y,
    width: old.width,
    height: old.height,
    zOrder: old.zOrder,
    visible: old.visible,
    instanceProps: typeof old.instanceProps === 'function' ? undefined : old.instanceProps,
  }
}

/** Migrate an entire layout config. Entries already in new format are passed through. */
export function migrateLayoutConfig(
  config: Record<string, unknown>,
  viewport: Viewport,
): RegionLayoutConfig {
  const result: RegionLayoutConfig = {}
  for (const [key, raw] of Object.entries(config)) {
    if (isLegacyEntry(raw)) {
      result[key] = migrateLayoutEntry(raw, viewport)
    } else {
      // Already new format — pass through
      result[key] = raw as RegionLayoutEntry
    }
  }
  return result
}
