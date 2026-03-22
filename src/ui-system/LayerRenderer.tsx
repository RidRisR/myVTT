import type React from 'react'
import type { UIRegistry } from './registry'
import type { LayerProps } from './types'

interface Props {
  registry: UIRegistry
  layoutMode: 'play' | 'edit'
}

export function LayerRenderer({ registry, layoutMode }: Props) {
  const layers = registry.getLayers()

  return (
    <>
      {layers.map((def) => {
        const LayerComponent: React.ComponentType<LayerProps> = def.component
        return (
          <div
            key={def.id}
            data-layer-id={def.id}
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: def.pointerEvents ? 'auto' : 'none',
            }}
          >
            <LayerComponent layoutMode={layoutMode} />
          </div>
        )
      })}
    </>
  )
}
