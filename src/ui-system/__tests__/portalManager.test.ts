// src/ui-system/__tests__/portalManager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PortalManager } from '../portalManager'

describe('PortalManager', () => {
  let manager: PortalManager

  beforeEach(() => {
    manager = new PortalManager()
  })

  afterEach(() => {
    manager.dispose()
  })

  it('creates a portal-layer container in document.body', () => {
    const layer = document.querySelector('.portal-layer')
    expect(layer).toBeTruthy()
    expect(layer!.parentElement).toBe(document.body)
  })

  it('portal-layer has pointer-events:none', () => {
    const layer = document.querySelector('.portal-layer') as HTMLElement
    expect(layer.style.pointerEvents).toBe('none')
  })

  it('createPortal returns an HTMLElement', () => {
    const el = manager.createPortal('test:region', 'standard')
    expect(el).toBeInstanceOf(HTMLElement)
  })

  it('portal has data-portal-for attribute', () => {
    const el = manager.createPortal('test:region', 'standard')
    expect(el.dataset.portalFor).toBe('test:region')
  })

  it('portal z-index matches layer ceiling', () => {
    const bg = manager.createPortal('a:bg', 'background')
    const std = manager.createPortal('a:std', 'standard')
    const ovl = manager.createPortal('a:ovl', 'overlay')
    expect(bg.style.zIndex).toBe('999')
    expect(std.style.zIndex).toBe('1999')
    expect(ovl.style.zIndex).toBe('2999')
  })

  it('getPortal returns created portal', () => {
    const el = manager.createPortal('test:region', 'standard')
    expect(manager.getPortal('test:region')).toBe(el)
  })

  it('getPortal returns undefined for unknown region', () => {
    expect(manager.getPortal('unknown')).toBeUndefined()
  })

  it('removePortal removes element from DOM', () => {
    manager.createPortal('test:region', 'standard')
    manager.removePortal('test:region')
    expect(manager.getPortal('test:region')).toBeUndefined()
    expect(document.querySelector('[data-portal-for="test:region"]')).toBeNull()
  })

  it('dispose removes portal-layer from DOM', () => {
    manager.createPortal('a:one', 'standard')
    manager.dispose()
    expect(document.querySelector('.portal-layer')).toBeNull()
  })
})
