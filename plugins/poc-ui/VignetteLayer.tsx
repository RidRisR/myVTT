import type { LayerProps } from '../../src/ui-system/types'

export function VignetteLayer({ layoutMode }: LayerProps) {
  if (layoutMode === 'edit') return null
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
        pointerEvents: 'none',
      }}
    />
  )
}
