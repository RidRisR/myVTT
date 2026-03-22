import { PanelErrorBoundary } from './PanelErrorBoundary'
import type { UIRegistry } from './registry'
import type { LayoutConfig, IComponentSDK } from './types'

interface Props {
  registry: UIRegistry
  layout: LayoutConfig
  makeSDK: (instanceKey: string, instanceProps: Record<string, unknown>) => IComponentSDK
  layoutMode: 'play' | 'edit'
}

export function PanelRenderer({ registry, layout, makeSDK, layoutMode }: Props) {
  const entries = Object.entries(layout)

  return (
    <>
      {entries.map(([instanceKey, entry]) => {
        if (entry.visible === false) return null

        // Parse componentId from "componentId#instance"
        const componentId = instanceKey.replace(/#[^#]*$/, '')
        const def = registry.getComponent(componentId)
        if (!def) return null

        const sdk = makeSDK(instanceKey, entry.instanceProps ?? {})
        const PanelComponent = def.component
        const showChrome = layoutMode === 'edit' || (def.chromeVisible ?? true)

        return (
          <div
            key={instanceKey}
            style={{
              position: 'absolute',
              left: entry.x,
              top: entry.y,
              width: entry.width,
              height: entry.height,
            }}
          >
            {showChrome && (
              <div
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  borderBottom: '1px solid rgba(255,255,255,0.15)',
                  padding: '2px 8px',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.5)',
                  userSelect: 'none',
                }}
              >
                {componentId}
              </div>
            )}
            <PanelErrorBoundary panelId={instanceKey}>
              <PanelComponent sdk={sdk} />
            </PanelErrorBoundary>
          </div>
        )
      })}
    </>
  )
}
