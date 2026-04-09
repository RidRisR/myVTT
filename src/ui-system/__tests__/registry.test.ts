import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UIRegistry } from '../registry'
import type { ComponentDef, LayerDef, RegionDef } from '../types'
import type { InputHandlerDef } from '../inputHandlerTypes'

const mockComponent = () => null
const mockLayer = () => null

const componentDef: ComponentDef = {
  id: 'test.hello',
  component: mockComponent as never,
  type: 'panel',
  defaultSize: { width: 200, height: 100 },
}

const layerDef: LayerDef = {
  id: 'test.vignette',
  zLayer: 'above-canvas',
  component: mockLayer as never,
}

describe('UIRegistry', () => {
  let registry: UIRegistry

  beforeEach(() => {
    registry = new UIRegistry()
  })

  it('stores and retrieves a registered component', () => {
    registry.registerComponent(componentDef)
    expect(registry.getComponent('test.hello')).toBe(componentDef)
  })

  it('returns undefined for unknown component id', () => {
    expect(registry.getComponent('unknown')).toBeUndefined()
  })

  it('HMR: duplicate registerComponent warns and overwrites', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registry.registerComponent(componentDef)
    registry.registerComponent(componentDef)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('test.hello'))
    spy.mockRestore()
  })

  it('stores and retrieves a registered layer', () => {
    registry.registerLayer(layerDef)
    expect(registry.getLayers()).toContain(layerDef)
  })

  it('returns layers sorted by zLayer order: below-canvas < above-canvas < above-ui', () => {
    registry.registerLayer({ id: 'a', zLayer: 'above-ui', component: mockLayer as never })
    registry.registerLayer({ id: 'b', zLayer: 'below-canvas', component: mockLayer as never })
    registry.registerLayer({ id: 'c', zLayer: 'above-canvas', component: mockLayer as never })

    const ids = registry.getLayers().map((l) => l.id)
    expect(ids).toEqual(['b', 'c', 'a'])
  })

  it('listComponents returns all registered components', () => {
    registry.registerComponent(componentDef)
    registry.registerComponent({
      id: 'test.world',
      component: mockComponent as never,
      type: 'overlay',
      defaultSize: { width: 100, height: 100 },
    })
    expect(registry.listComponents()).toHaveLength(2)
  })

  it('listComponentsByType filters by panel type', () => {
    registry.registerComponent(componentDef) // type: 'panel'
    registry.registerComponent({
      id: 'test.bg',
      component: mockComponent as never,
      type: 'background',
      defaultSize: { width: 100, height: 100 },
    })
    registry.registerComponent({
      id: 'test.overlay',
      component: mockComponent as never,
      type: 'overlay',
      defaultSize: { width: 100, height: 100 },
    })

    expect(registry.listComponentsByType('panel')).toHaveLength(1)
    expect(registry.listComponentsByType('panel')[0]!.id).toBe('test.hello')
    expect(registry.listComponentsByType('background')).toHaveLength(1)
    expect(registry.listComponentsByType('overlay')).toHaveLength(1)
  })

  it('listComponents returns empty array when none registered', () => {
    expect(registry.listComponents()).toEqual([])
  })
})

const mockHandlerComponent = (() => null) as never

describe('UIRegistry — input handlers', () => {
  let registry: UIRegistry

  beforeEach(() => {
    registry = new UIRegistry()
  })

  it('stores and retrieves a registered input handler', () => {
    const def: InputHandlerDef = { component: mockHandlerComponent }
    registry.registerInputHandler('test:modifier', def)
    expect(registry.getInputHandler('test:modifier')).toBe(def)
  })

  it('returns undefined for unknown input handler type', () => {
    expect(registry.getInputHandler('unknown')).toBeUndefined()
  })

  it('throws on duplicate input handler type', () => {
    const def: InputHandlerDef = { component: mockHandlerComponent }
    registry.registerInputHandler('test:modifier', def)
    expect(() => {
      registry.registerInputHandler('test:modifier', def)
    }).toThrow('test:modifier')
  })
})

// ── Region methods ──

function makeDef(overrides: Partial<RegionDef> = {}): RegionDef {
  return {
    id: 'test:region',
    component: (() => null) as unknown as RegionDef['component'],
    lifecycle: 'persistent',
    defaultSize: { width: 200, height: 100 },
    layer: 'standard',
    ...overrides,
  }
}

describe('UIRegistry region methods', () => {
  let reg: UIRegistry

  beforeEach(() => {
    reg = new UIRegistry()
  })

  it('registerRegion + getRegion round-trip', () => {
    const def = makeDef({ id: 'a:panel' })
    reg.registerRegion(def)
    expect(reg.getRegion('a:panel')).toBe(def)
  })

  it('getRegion returns undefined for unknown id', () => {
    expect(reg.getRegion('unknown')).toBeUndefined()
  })

  it('listRegions returns all registered regions', () => {
    reg.registerRegion(makeDef({ id: 'a:one' }))
    reg.registerRegion(makeDef({ id: 'a:two' }))
    expect(reg.listRegions()).toHaveLength(2)
  })

  it('listRegionsByLifecycle filters correctly', () => {
    reg.registerRegion(makeDef({ id: 'a:persist', lifecycle: 'persistent' }))
    reg.registerRegion(makeDef({ id: 'a:demand', lifecycle: 'on-demand' }))
    expect(reg.listRegionsByLifecycle('persistent')).toHaveLength(1)
    expect(reg.listRegionsByLifecycle('persistent')[0].id).toBe('a:persist')
    expect(reg.listRegionsByLifecycle('on-demand')).toHaveLength(1)
  })

  it('HMR: duplicate registerRegion warns and overwrites', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const def1 = makeDef({ id: 'a:panel' })
    const def2 = makeDef({ id: 'a:panel', layer: 'overlay' })
    reg.registerRegion(def1)
    reg.registerRegion(def2)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('a:panel'))
    expect(reg.getRegion('a:panel')?.layer).toBe('overlay')
    spy.mockRestore()
  })

  it('registerComponent backward compat: registers as region', () => {
    reg.registerComponent({
      id: 'old:panel',
      component: (() => null) as unknown as React.ComponentType<{ sdk: unknown }>,
      type: 'panel',
      defaultSize: { width: 200, height: 100 },
      defaultPlacement: { anchor: 'top-right', offsetX: 10, offsetY: 20 },
    })
    const region = reg.getRegion('old:panel')
    expect(region).toBeDefined()
    expect(region!.lifecycle).toBe('persistent')
    expect(region!.layer).toBe('standard')
    expect(region!.defaultPlacement).toEqual({ anchor: 'top-right', offsetX: 10, offsetY: 20 })
  })

  it('registerComponent maps type correctly', () => {
    const register = (type: 'background' | 'panel' | 'overlay') => {
      reg.registerComponent({
        id: `old:${type}`,
        component: (() => null) as unknown as React.ComponentType<{ sdk: unknown }>,
        type,
        defaultSize: { width: 100, height: 100 },
      })
    }
    register('background')
    register('panel')
    register('overlay')
    expect(reg.getRegion('old:background')!.layer).toBe('background')
    expect(reg.getRegion('old:panel')!.layer).toBe('standard')
    expect(reg.getRegion('old:overlay')!.layer).toBe('overlay')
  })

  it('getComponent still works for backward compat', () => {
    reg.registerComponent({
      id: 'old:panel',
      component: (() => null) as unknown as React.ComponentType<{ sdk: unknown }>,
      type: 'panel',
      defaultSize: { width: 200, height: 100 },
    })
    expect(reg.getComponent('old:panel')).toBeDefined()
  })
})
