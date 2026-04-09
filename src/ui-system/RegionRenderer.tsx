// src/ui-system/RegionRenderer.tsx
import { RegionErrorBoundary } from './PanelErrorBoundary'
import { resolvePosition, clampToViewport, layerBaseZ } from './layoutEngine'
import { RegionEditOverlay } from './RegionEditOverlay'
import type { UIRegistry } from './registry'
import type { RegionLayoutConfig, IRegionSDK, Viewport } from './types'
import type { AnchorPoint, RegionLayoutEntry } from './regionTypes'

/** Find the layout entry for a region, handling legacy instance-key suffixes (e.g. 'id#1') */
function findEntry(
  layout: RegionLayoutConfig,
  regionId: string,
): { instanceKey: string; entry: RegionLayoutEntry } | undefined {
  // Direct match (new format: key === regionId)
  if (layout[regionId]) return { instanceKey: regionId, entry: layout[regionId] }
  // Legacy match: key starts with regionId + '#'
  for (const key of Object.keys(layout)) {
    if (key.startsWith(regionId + '#')) {
      return { instanceKey: key, entry: layout[key] }
    }
  }
  return undefined
}

interface Props {
  registry: UIRegistry
  layout: RegionLayoutConfig
  makeSDK: (instanceKey: string, instanceProps: Record<string, unknown>) => IRegionSDK
  viewport: Viewport
  layoutMode: 'play' | 'edit'
  onDragEnd?: (
    instanceKey: string,
    placement: { anchor: AnchorPoint; offsetX: number; offsetY: number },
  ) => void
  onResize?: (instanceKey: string, size: { width: number; height: number }) => void
}

export function RegionRenderer({
  registry,
  layout,
  makeSDK,
  viewport,
  layoutMode,
  onDragEnd,
  onResize,
}: Props) {
  const regions = registry.listRegionsByLifecycle('persistent')

  return (
    <>
      {regions.map((def) => {
        const match = findEntry(layout, def.id)
        if (!match || match.entry.visible === false) return null

        const { instanceKey, entry } = match
        const rawPos = resolvePosition(entry, viewport)
        const pos = clampToViewport(rawPos, { width: entry.width, height: entry.height }, viewport)
        const Comp = def.component

        return (
          <div
            key={def.id}
            className="region-container"
            data-region={def.id}
            data-layer={def.layer}
            role="region"
            aria-label={def.id}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              width: entry.width,
              height: entry.height,
              zIndex: layerBaseZ(def.layer) + entry.zOrder,
              pointerEvents: 'auto',
              background: 'transparent',
              contain: 'layout paint',
              overflow: 'hidden',
            }}
          >
            {/* Content layer: isolation:isolate creates stacking context.
                Edit mode pointerEvents:none ensures drag overlay receives events. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                isolation: 'isolate',
                pointerEvents: layoutMode === 'edit' ? 'none' : undefined,
              }}
            >
              <RegionErrorBoundary panelId={def.id}>
                <Comp sdk={makeSDK(instanceKey, entry.instanceProps ?? {})} />
              </RegionErrorBoundary>
            </div>
            {layoutMode === 'edit' && (
              <RegionEditOverlay
                def={def}
                entry={entry}
                currentPos={pos}
                viewport={viewport}
                onDragEnd={onDragEnd}
                onResize={onResize}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
