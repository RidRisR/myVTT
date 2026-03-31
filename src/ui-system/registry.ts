// src/ui-system/registry.ts
import type { ComponentDef, LayerDef, ZLayer, PanelType } from './types'
import type { InputHandlerDef } from './inputHandlerTypes'

const Z_ORDER: ZLayer[] = ['below-canvas', 'above-canvas', 'above-ui']

export class UIRegistry {
  private components = new Map<string, ComponentDef>()
  private layers: LayerDef[] = []
  private inputHandlers = new Map<string, InputHandlerDef>()

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
