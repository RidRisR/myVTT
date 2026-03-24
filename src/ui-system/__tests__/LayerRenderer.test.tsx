import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LayerRenderer } from '../LayerRenderer'
import { UIRegistry } from '../registry'

describe('LayerRenderer', () => {
  it('renders all registered layers', () => {
    const registry = new UIRegistry()
    registry.registerLayer({ id: 'a', zLayer: 'above-canvas', component: () => <div>layer-a</div> })
    registry.registerLayer({ id: 'b', zLayer: 'above-ui', component: () => <div>layer-b</div> })

    render(<LayerRenderer registry={registry} layoutMode="play" />)
    expect(screen.getByText('layer-a')).toBeInTheDocument()
    expect(screen.getByText('layer-b')).toBeInTheDocument()
  })

  it('renders layers in zLayer order (below-canvas first, above-ui last)', () => {
    const registry = new UIRegistry()
    registry.registerLayer({ id: 'top', zLayer: 'above-ui', component: () => <div>top</div> })
    registry.registerLayer({
      id: 'bottom',
      zLayer: 'below-canvas',
      component: () => <div>bottom</div>,
    })

    const { container } = render(<LayerRenderer registry={registry} layoutMode="play" />)
    const divs = container.querySelectorAll('[data-layer-id]')
    expect(divs[0]?.getAttribute('data-layer-id')).toBe('bottom')
    expect(divs[1]?.getAttribute('data-layer-id')).toBe('top')
  })
})
