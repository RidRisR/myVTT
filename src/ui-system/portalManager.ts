// src/ui-system/portalManager.ts
import type { RegionLayer } from './regionTypes'

function layerCeilingZ(layer: RegionLayer): number {
  switch (layer) {
    case 'background':
      return 999
    case 'standard':
      return 1999
    case 'overlay':
      return 2999
  }
}

/**
 * Manages per-region portal containers for Radix/floating UI.
 * Portal containers live in a dedicated layer with z-index at the layer ceiling,
 * ensuring dropdowns/popovers are above all same-layer panels but below the next layer.
 */
export class PortalManager {
  private portals = new Map<string, HTMLElement>()
  private container: HTMLElement

  constructor() {
    this.container = document.createElement('div')
    this.container.className = 'portal-layer'
    this.container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0'
    document.body.appendChild(this.container)
  }

  createPortal(regionId: string, layer: RegionLayer): HTMLElement {
    const el = document.createElement('div')
    el.dataset.portalFor = regionId
    el.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:${layerCeilingZ(layer)}`
    this.container.appendChild(el)
    this.portals.set(regionId, el)
    return el
  }

  getPortal(regionId: string): HTMLElement | undefined {
    return this.portals.get(regionId)
  }

  removePortal(regionId: string): void {
    const el = this.portals.get(regionId)
    if (el) {
      el.remove()
      this.portals.delete(regionId)
    }
  }

  dispose(): void {
    this.container.remove()
    this.portals.clear()
  }
}
