// src/ui-system/layoutEngine.ts
import type {
  AnchorPoint,
  RegionLayoutEntry,
  RegionLayer,
  ResizeOrigin,
  Viewport,
} from './regionTypes'

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
    case 'top-center':
      return { x: (vw - pw) / 2, y: 0 }
    case 'top-right':
      return { x: vw - pw, y: 0 }
    case 'center-left':
      return { x: 0, y: (vh - ph) / 2 }
    case 'center':
      return { x: (vw - pw) / 2, y: (vh - ph) / 2 }
    case 'center-right':
      return { x: vw - pw, y: (vh - ph) / 2 }
    case 'bottom-left':
      return { x: 0, y: vh - ph }
    case 'bottom-center':
      return { x: (vw - pw) / 2, y: vh - ph }
    case 'bottom-right':
      return { x: vw - pw, y: vh - ph }
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
  const thirdX = viewport.width / 3
  const cy = viewport.height / 2
  const inCenterX = panelCenter.x >= thirdX && panelCenter.x < thirdX * 2
  if (inCenterX && panelCenter.y < cy) return 'top-center'
  if (inCenterX && panelCenter.y >= cy) return 'bottom-center'
  if (panelCenter.x < thirdX && panelCenter.y < cy) return 'top-left'
  if (panelCenter.x >= thirdX * 2 && panelCenter.y < cy) return 'top-right'
  if (panelCenter.x < thirdX && panelCenter.y >= cy) return 'bottom-left'
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

/**
 * Map an AnchorPoint to its (fx, fy) factor.
 * Factor = how much the base position depends on the element size.
 * top-left → (0,0), center → (0.5,0.5), bottom-right → (1,1).
 */
export function anchorFactor(anchor: AnchorPoint): { x: number; y: number } {
  switch (anchor) {
    case 'top-left':
      return { x: 0, y: 0 }
    case 'top-center':
      return { x: 0.5, y: 0 }
    case 'top-right':
      return { x: 1, y: 0 }
    case 'center-left':
      return { x: 0, y: 0.5 }
    case 'center':
      return { x: 0.5, y: 0.5 }
    case 'center-right':
      return { x: 1, y: 0.5 }
    case 'bottom-left':
      return { x: 0, y: 1 }
    case 'bottom-center':
      return { x: 0.5, y: 1 }
    case 'bottom-right':
      return { x: 1, y: 1 }
  }
}

/** Map a ResizeOrigin to its (fx, fy) factor on the 9-point grid. */
export function resizeOriginFactor(origin: ResizeOrigin): { x: number; y: number } {
  switch (origin) {
    case 'top-left':
      return { x: 0, y: 0 }
    case 'top-center':
      return { x: 0.5, y: 0 }
    case 'top-right':
      return { x: 1, y: 0 }
    case 'center-left':
      return { x: 0, y: 0.5 }
    case 'center':
      return { x: 0.5, y: 0.5 }
    case 'center-right':
      return { x: 1, y: 0.5 }
    case 'bottom-left':
      return { x: 0, y: 1 }
    case 'bottom-center':
      return { x: 0.5, y: 1 }
    case 'bottom-right':
      return { x: 1, y: 1 }
  }
}

/**
 * Compute the offset compensation needed to keep the resizeOrigin point
 * visually fixed when the element size changes.
 *
 * Formula: dOffset = (anchorFactor - originFactor) × dSize
 */
export function computeResizeCompensation(
  oldSize: { width: number; height: number },
  newSize: { width: number; height: number },
  anchor: AnchorPoint,
  origin: ResizeOrigin,
): { dOffsetX: number; dOffsetY: number } {
  const af = anchorFactor(anchor)
  const of_ = resizeOriginFactor(origin)
  const dw = newSize.width - oldSize.width
  const dh = newSize.height - oldSize.height
  return {
    dOffsetX: (af.x - of_.x) * dw || 0,
    dOffsetY: (af.y - of_.y) * dh || 0,
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
