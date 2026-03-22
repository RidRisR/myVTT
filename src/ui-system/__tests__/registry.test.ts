import { describe, it, expect, beforeEach } from 'vitest'
import { UIRegistry } from '../registry'
import type { ComponentDef, LayerDef } from '../types'

const mockComponent = () => null
const mockLayer = () => null

const componentDef: ComponentDef = {
  id: 'test.hello',
  component: mockComponent as never,
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

  it('throws on duplicate component id', () => {
    registry.registerComponent(componentDef)
    expect(() => {
      registry.registerComponent(componentDef)
    }).toThrow('test.hello')
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
})
