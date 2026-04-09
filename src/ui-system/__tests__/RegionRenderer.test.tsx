// src/ui-system/__tests__/RegionRenderer.test.tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RegionRenderer } from '../RegionRenderer'
import { UIRegistry } from '../registry'
import type { RegionLayoutConfig, IRegionSDK } from '../types'

function mockSDK(): IRegionSDK {
  return {
    read: {} as IRegionSDK['read'],
    data: { useEntity: () => undefined, useComponent: () => undefined, useQuery: () => [] },
    workflow: { runWorkflow: vi.fn() } as unknown as IRegionSDK['workflow'],
    context: { instanceProps: {}, role: 'GM', layoutMode: 'play' },
    interaction: undefined,
    awareness: {
      subscribe: () => () => {},
      broadcast: () => {},
      clear: () => {},
      usePeers: () => new Map(),
    },
    log: { subscribe: () => () => {}, useEntries: () => ({ entries: [], newIds: new Set() }) },
    ui: {
      openPanel: () => '',
      closePanel: () => {},
      resize: () => {},
      getPortalContainer: () => document.body,
    },
  }
}

const VP = { width: 1920, height: 1080 }

function TestPanel() {
  return <div data-testid="panel-content">Hello</div>
}

function CrashPanel(): React.JSX.Element {
  throw new Error('boom')
}

describe('RegionRenderer', () => {
  it('renders a persistent region at the resolved position', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 10,
        offsetY: 20,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    expect(screen.getByTestId('panel-content')).toBeTruthy()
  })

  it('does not render on-demand regions', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:ondemand',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'on-demand',
      defaultSize: { width: 200, height: 100 },
      layer: 'overlay',
    })
    const layout: RegionLayoutConfig = {
      'test:ondemand': {
        anchor: 'center',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    expect(screen.queryByTestId('panel-content')).toBeNull()
  })

  it('does not render region with visible: false', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:hidden',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:hidden': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
        visible: false,
      },
    }
    render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    expect(screen.queryByTestId('panel-content')).toBeNull()
  })

  it('applies zIndex = layerBaseZ + entry.zOrder', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 5,
      },
    }
    const { container } = render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    const regionDiv = container.querySelector('[data-region="test:panel"]') as HTMLElement
    expect(regionDiv.style.zIndex).toBe('1005')
  })

  it('region container has contain:layout paint and overflow:hidden', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    const { container } = render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    const regionDiv = container.querySelector('[data-region="test:panel"]') as HTMLElement
    expect(regionDiv.style.contain).toBe('layout paint')
    expect(regionDiv.style.overflow).toBe('hidden')
  })

  it('content wrapper has isolation:isolate', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    const { container } = render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    const wrapper = container.querySelector('[data-region="test:panel"] > div') as HTMLElement
    expect(wrapper.style.isolation).toBe('isolate')
  })

  it('edit mode: content wrapper has pointerEvents:none', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    const { container } = render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="edit"
      />,
    )
    const wrapper = container.querySelector('[data-region="test:panel"] > div') as HTMLElement
    expect(wrapper.style.pointerEvents).toBe('none')
  })

  it('ErrorBoundary catches crash without affecting siblings', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:crash',
      component: CrashPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    reg.registerRegion({
      id: 'test:ok',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:crash': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
      'test:ok': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 200,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    expect(screen.getByText(/test:crash crashed/)).toBeTruthy()
    expect(screen.getByTestId('panel-content')).toBeTruthy()
    spy.mockRestore()
  })

  it('has role="region" and aria-label for accessibility', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    const { container } = render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    const regionDiv = container.querySelector('[data-region="test:panel"]') as HTMLElement
    expect(regionDiv.getAttribute('role')).toBe('region')
    expect(regionDiv.getAttribute('aria-label')).toBe('test:panel')
  })
})
