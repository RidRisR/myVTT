// src/ui-system/RegionRenderer.tsx
import { RegionErrorBoundary } from './PanelErrorBoundary'
import { resolvePosition, clampToViewport, layerBaseZ } from './layoutEngine'
import { RegionEditOverlay } from './RegionEditOverlay'
import type { UIRegistry } from './registry'
import type { RegionLayoutConfig, IRegionSDK, Viewport } from './types'
import type { AnchorPoint } from './regionTypes'

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
        const entry = layout[def.id]
        if (!entry || entry.visible === false) return null

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
                <Comp sdk={makeSDK(def.id, entry.instanceProps ?? {})} />
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
