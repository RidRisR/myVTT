// src/ui-system/layoutEngine.ts
import type { AnchorPoint, RegionLayoutEntry, RegionLayer, Viewport } from './regionTypes'

/**
 * Compute the base pixel position for an anchor point,
 * given panel size and viewport dimensions.
 */
export function anchorBase(
  anchor: AnchorPoint,
  panelSize: { width: number; height: number },
  viewport: Viewport,
): { x: number; y: number } {
  const { width: vw, height: vh } = viewport
  const { width: pw, height: ph } = panelSize
  switch (anchor) {
    case 'top-left':
      return { x: 0, y: 0 }
    case 'top-right':
      return { x: vw - pw, y: 0 }
    case 'bottom-left':
      return { x: 0, y: vh - ph }
    case 'bottom-right':
      return { x: vw - pw, y: vh - ph }
    case 'center':
      return { x: (vw - pw) / 2, y: (vh - ph) / 2 }
  }
}

/** Resolve a RegionLayoutEntry to absolute pixel coordinates. */
export function resolvePosition(
  entry: RegionLayoutEntry,
  viewport: Viewport,
): { x: number; y: number } {
  const base = anchorBase(entry.anchor, { width: entry.width, height: entry.height }, viewport)
  return {
    x: base.x + entry.offsetX,
    y: base.y + entry.offsetY,
  }
}

/** Infer the best anchor from a panel center position within the viewport. */
export function inferAnchor(
  panelCenter: { x: number; y: number },
  viewport: Viewport,
): AnchorPoint {
  const cx = viewport.width / 2
  const cy = viewport.height / 2
  if (panelCenter.x < cx && panelCenter.y < cy) return 'top-left'
  if (panelCenter.x >= cx && panelCenter.y < cy) return 'top-right'
  if (panelCenter.x < cx && panelCenter.y >= cy) return 'bottom-left'
  return 'bottom-right'
}

/**
 * After a drag ends, infer anchor + offset from the panel's final pixel rect.
 * This is the inverse of resolvePosition.
 */
export function inferPlacement(
  panelRect: { x: number; y: number; width: number; height: number },
  viewport: Viewport,
): { anchor: AnchorPoint; offsetX: number; offsetY: number } {
  const centerX = panelRect.x + panelRect.width / 2
  const centerY = panelRect.y + panelRect.height / 2
  const anchor = inferAnchor({ x: centerX, y: centerY }, viewport)
  const base = anchorBase(anchor, { width: panelRect.width, height: panelRect.height }, viewport)
  return {
    anchor,
    offsetX: panelRect.x - base.x,
    offsetY: panelRect.y - base.y,
  }
}

/** Clamp a position so the panel stays within viewport bounds. Does NOT modify layout data. */
export function clampToViewport(
  pos: { x: number; y: number },
  size: { width: number; height: number },
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(pos.x, viewport.width - size.width)),
    y: Math.max(0, Math.min(pos.y, viewport.height - size.height)),
  }
}

/** Base z-index for each layer grouping. */
export function layerBaseZ(layer: RegionLayer): number {
  switch (layer) {
    case 'background':
      return 0
    case 'standard':
      return 1000
    case 'overlay':
      return 2000
  }
}
