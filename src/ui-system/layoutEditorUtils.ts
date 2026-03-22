import type { LayoutConfig, LayoutEntry } from './types'

export function applyDrag(
  layout: LayoutConfig,
  instanceKey: string,
  delta: { dx: number; dy: number },
): LayoutConfig {
  const entry = layout[instanceKey]
  if (!entry) return layout

  const updated: LayoutEntry = {
    x: entry.x + delta.dx,
    y: entry.y + delta.dy,
    width: entry.width,
    height: entry.height,
    visible: entry.visible,
    instanceProps: entry.instanceProps,
  }
  return {
    ...layout,
    [instanceKey]: updated,
  }
}
