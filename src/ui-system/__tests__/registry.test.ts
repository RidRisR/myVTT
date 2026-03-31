import { describe, it, expect, beforeEach } from 'vitest'
import { UIRegistry } from '../registry'
import type { ComponentDef, LayerDef } from '../types'
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
