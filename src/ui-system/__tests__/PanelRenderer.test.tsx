import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelRenderer } from '../PanelRenderer'
import { UIRegistry } from '../registry'
import type { LayoutConfig, IComponentSDK } from '../types'

const mockSDK = {} as IComponentSDK

describe('PanelRenderer', () => {
  it('renders a registered component at the specified position', () => {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'test.panel',
      component: () => <div>hello panel</div>,
      defaultSize: { width: 200, height: 100 },
    })

    const layout: LayoutConfig = {
      'test.panel#1': { x: 50, y: 80, width: 200, height: 100 },
    }

    render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="play"
      />,
    )
    expect(screen.getByText('hello panel')).toBeInTheDocument()
  })

  it('renders nothing for an unknown component id', () => {
    const registry = new UIRegistry()
    const layout: LayoutConfig = {
      'unknown.panel#1': { x: 0, y: 0, width: 100, height: 100 },
    }

    const { container } = render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="play"
      />,
    )
    // container.firstChild is the Fragment wrapper — assert on container itself
    expect(container).toBeEmptyDOMElement()
  })

  it('catches a crashing panel in ErrorBoundary without unmounting others', () => {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'test.crash',
      component: () => {
        throw new Error('boom')
      },
      defaultSize: { width: 100, height: 100 },
    })
    registry.registerComponent({
      id: 'test.ok',
      component: () => <div>survivor</div>,
      defaultSize: { width: 100, height: 100 },
    })

    const layout: LayoutConfig = {
      'test.crash#1': { x: 0, y: 0, width: 100, height: 100 },
      'test.ok#1': { x: 110, y: 0, width: 100, height: 100 },
    }

    // Suppress React's error boundary console.error in test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="play"
      />,
    )
    spy.mockRestore()

    expect(screen.getByText('survivor')).toBeInTheDocument()
  })
})
