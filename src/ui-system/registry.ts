// src/ui-system/registry.ts
import type { ComponentDef, LayerDef, ZLayer } from './types'

const Z_ORDER: ZLayer[] = ['below-canvas', 'above-canvas', 'above-ui']

export class UIRegistry {
  private components = new Map<string, ComponentDef>()
  private layers: LayerDef[] = []

  registerComponent(def: ComponentDef): void {
    if (this.components.has(def.id)) {
      throw new Error(`UIRegistry: component id "${def.id}" already registered`)
    }
    this.components.set(def.id, def)
  }

  registerLayer(def: LayerDef): void {
    this.layers.push(def)
  }

  getComponent(id: string): ComponentDef | undefined {
    return this.components.get(id)
  }

  getLayers(): LayerDef[] {
    return [...this.layers].sort((a, b) => Z_ORDER.indexOf(a.zLayer) - Z_ORDER.indexOf(b.zLayer))
  }
}
