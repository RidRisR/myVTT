// src/ui-system/OnDemandHost.tsx
import { RegionErrorBoundary } from './PanelErrorBoundary'
import { resolvePosition, clampToViewport, layerBaseZ } from './layoutEngine'
import type { UIRegistry } from './registry'
import type { RegionLayoutConfig, IRegionSDK, Viewport } from './types'
import type { OnDemandInstance } from './regionTypes'

export type { OnDemandInstance } from './regionTypes'

interface Props {
  registry: UIRegistry
  instances: OnDemandInstance[]
  layout: RegionLayoutConfig
  makeSDK: (instanceKey: string, instanceProps: Record<string, unknown>) => IRegionSDK
  viewport: Viewport
}

export function OnDemandHost({ registry, instances, layout, makeSDK, viewport }: Props) {
  if (instances.length === 0) return null

  return (
    <>
      {instances.map(({ regionId, instanceKey, instanceProps, zOrder }) => {
        const def = registry.getRegion(regionId)
        if (!def || def.lifecycle !== 'on-demand') return null

        // Position priority: layout template > defaultPlacement > center
        const template = layout[regionId]
        const entry = template ?? {
          anchor: def.defaultPlacement?.anchor ?? ('center' as const),
          offsetX: def.defaultPlacement?.offsetX ?? 0,
          offsetY: def.defaultPlacement?.offsetY ?? 0,
          width: def.defaultSize.width,
          height: def.defaultSize.height,
          zOrder: 0,
        }

        const rawPos = resolvePosition(entry, viewport)
        const pos = clampToViewport(rawPos, { width: entry.width, height: entry.height }, viewport)
        const Comp = def.component

        return (
          <div
            key={instanceKey}
            data-instance={instanceKey}
            data-region={regionId}
            data-layer={def.layer}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              width: entry.width,
              height: entry.height,
              zIndex: layerBaseZ(def.layer) + zOrder,
              pointerEvents: 'auto',
              background: 'transparent',
              contain: 'layout paint',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, isolation: 'isolate' }}>
              <RegionErrorBoundary panelId={instanceKey}>
                <Comp sdk={makeSDK(instanceKey, instanceProps)} />
              </RegionErrorBoundary>
            </div>
          </div>
        )
      })}
    </>
  )
}
