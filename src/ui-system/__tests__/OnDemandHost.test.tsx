// src/ui-system/__tests__/OnDemandHost.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnDemandHost } from '../OnDemandHost'
import type { OnDemandInstance } from '../regionTypes'
import { UIRegistry } from '../registry'
import type { RegionLayoutConfig, IRegionSDK, Viewport } from '../types'

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

const VP: Viewport = { width: 1920, height: 1080 }

function DetailPanel() {
  return <div data-testid="detail-content">Detail</div>
}

describe('OnDemandHost', () => {
  it('renders nothing when instances is empty', () => {
    const reg = new UIRegistry()
    const { container } = render(
      <OnDemandHost
        registry={reg}
        instances={[]}
        layout={{}}
        makeSDK={() => mockSDK()}
        viewport={VP}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders on-demand instances', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:detail',
      component: DetailPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'on-demand',
      defaultSize: { width: 400, height: 300 },
      layer: 'overlay',
    })
    const instances: OnDemandInstance[] = [
      { regionId: 'test:detail', instanceKey: 'test:detail#a1', instanceProps: {}, zOrder: 1 },
    ]
    render(
      <OnDemandHost
        registry={reg}
        instances={instances}
        layout={{}}
        makeSDK={() => mockSDK()}
        viewport={VP}
      />,
    )
    expect(screen.getByTestId('detail-content')).toBeTruthy()
  })

  it('uses layout template position when available', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:detail',
      component: DetailPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'on-demand',
      defaultSize: { width: 400, height: 300 },
      layer: 'overlay',
    })
    const layout: RegionLayoutConfig = {
      'test:detail': {
        anchor: 'top-right',
        offsetX: -10,
        offsetY: 20,
        width: 400,
        height: 300,
        zOrder: 0,
      },
    }
    const instances: OnDemandInstance[] = [
      { regionId: 'test:detail', instanceKey: 'test:detail#a1', instanceProps: {}, zOrder: 1 },
    ]
    const { container } = render(
      <OnDemandHost
        registry={reg}
        instances={instances}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
      />,
    )
    const div = container.querySelector('[data-instance="test:detail#a1"]') as HTMLElement
    expect(div).toBeTruthy()
    // Position: top-right anchor, panel 400 wide → base x = 1920-400 = 1520, + offset -10 = 1510
    expect(div.style.left).toBe('1510px')
  })

  it('skips instances whose regionId is not registered', () => {
    const reg = new UIRegistry()
    const instances: OnDemandInstance[] = [
      { regionId: 'unknown:thing', instanceKey: 'unknown:thing#1', instanceProps: {}, zOrder: 1 },
    ]
    const { container } = render(
      <OnDemandHost
        registry={reg}
        instances={instances}
        layout={{}}
        makeSDK={() => mockSDK()}
        viewport={VP}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('passes instanceProps to makeSDK', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:detail',
      component: DetailPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'on-demand',
      defaultSize: { width: 400, height: 300 },
      layer: 'overlay',
    })
    const makeSDK = vi.fn().mockReturnValue(mockSDK())
    const instances: OnDemandInstance[] = [
      {
        regionId: 'test:detail',
        instanceKey: 'test:detail#a1',
        instanceProps: { spellId: 'fireball' },
        zOrder: 1,
      },
    ]
    render(
      <OnDemandHost
        registry={reg}
        instances={instances}
        layout={{}}
        makeSDK={makeSDK}
        viewport={VP}
      />,
    )
    expect(makeSDK).toHaveBeenCalledWith('test:detail#a1', { spellId: 'fireball' })
  })
})
