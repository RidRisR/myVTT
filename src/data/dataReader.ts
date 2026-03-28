// src/data/dataReader.ts
import type { IDataReader } from '../workflow/types'
import type { ComponentTypeMap } from '../shared/componentTypes'
import type { Entity } from '../shared/entityTypes'
import { useWorldStore } from '../stores/worldStore'

/**
 * Create a production IDataReader backed by worldStore.
 * Imperative (non-reactive) — suitable for workflow steps, canDrop callbacks,
 * and event handlers where React hooks cannot be used.
 */
export function createDataReader(): IDataReader {
  return {
    entity: (id: string): Entity | undefined => {
      return useWorldStore.getState().entities[id]
    },

    component: ((entityId: string, key: string) => {
      const entity = useWorldStore.getState().entities[entityId]
      if (!entity) return undefined
      return entity.components[key]
    }) as {
      <K extends keyof ComponentTypeMap>(entityId: string, key: K): ComponentTypeMap[K] | undefined
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- fallback overload
      <T = unknown>(entityId: string, key: string): T | undefined
    },

    query: (spec: { has?: string[] }): Entity[] => {
      const entities = Object.values(useWorldStore.getState().entities)
      const keys = spec.has
      if (!keys || keys.length === 0) return entities
      return entities.filter((e) => keys.every((key) => key in e.components))
    },

    formulaTokens: (_entityId: string): Record<string, number> => {
      // Production dataReader delegates to getRulePluginSync — but that creates
      // a circular dependency. Workflow context.ts already wires this via deps.
      // This stub satisfies the IDataReader interface for non-workflow callers.
      return {}
    },
  }
}
