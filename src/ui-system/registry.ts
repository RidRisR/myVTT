// src/ui-system/registry.ts
import type { ComponentDef, LayerDef, ZLayer, PanelType, RegionDef } from './types'
import type { InputHandlerDef } from './inputHandlerTypes'

const Z_ORDER: ZLayer[] = ['below-canvas', 'above-canvas', 'above-ui']

export class UIRegistry {
  private components = new Map<string, ComponentDef>()
  private regions = new Map<string, RegionDef>()
  private layers: LayerDef[] = []
  private inputHandlers = new Map<string, InputHandlerDef>()

  registerRegion(def: RegionDef): void {
    if (this.regions.has(def.id)) {
      console.warn(`UIRegistry: region id "${def.id}" already registered, overwriting (HMR)`)
    }
    this.regions.set(def.id, def)
  }

  getRegion(id: string): RegionDef | undefined {
    return this.regions.get(id)
  }

  listRegions(): RegionDef[] {
    return [...this.regions.values()]
  }

  listRegionsByLifecycle(lifecycle: 'persistent' | 'on-demand'): RegionDef[] {
    return [...this.regions.values()].filter((r) => r.lifecycle === lifecycle)
  }

  /** @deprecated Use registerRegion. Kept for backward compatibility. */
  registerComponent(def: ComponentDef): void {
    // Store in legacy map for getComponent backward compat
    if (this.components.has(def.id)) {
      console.warn(`UIRegistry: component id "${def.id}" already registered, overwriting (HMR)`)
    }
    this.components.set(def.id, def)

    // Also register as Region
    this.registerRegion({
      id: def.id,
      component: def.component,
      lifecycle: 'persistent',
      defaultSize: def.defaultSize,
      minSize: def.minSize,
      defaultPlacement: def.defaultPlacement
        ? {
            anchor: def.defaultPlacement.anchor,
            offsetX: def.defaultPlacement.offsetX,
            offsetY: def.defaultPlacement.offsetY,
          }
        : undefined,
      layer: def.type === 'panel' ? 'standard' : def.type,
    })
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

  listComponents(): ComponentDef[] {
    return [...this.components.values()]
  }

  /**
   * Returns components filtered by type. Creates a new array on each call —
   * do NOT use inside zustand selectors or React render paths without memoization.
   */
  listComponentsByType(type: PanelType): ComponentDef[] {
    return [...this.components.values()].filter((c) => c.type === type)
  }

  registerInputHandler(inputType: string, def: InputHandlerDef): void {
    if (this.inputHandlers.has(inputType)) {
      throw new Error(`UIRegistry: input handler type "${inputType}" already registered`)
    }
    this.inputHandlers.set(inputType, def)
  }

  getInputHandler(inputType: string): InputHandlerDef | undefined {
    return this.inputHandlers.get(inputType)
  }
}
