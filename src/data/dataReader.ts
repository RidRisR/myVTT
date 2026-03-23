// src/data/dataReader.ts
import type { IDataReader } from '../workflow/types'
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T required for caller type inference
    component: <T>(entityId: string, key: string): T | undefined => {
      const entity = useWorldStore.getState().entities[entityId]
      if (!entity) return undefined
      return entity.components[key] as T | undefined
    },

    query: (spec: { has?: string[] }): Entity[] => {
      const entities = Object.values(useWorldStore.getState().entities)
      const keys = spec.has
      if (!keys || keys.length === 0) return entities
      return entities.filter((e) => keys.every((key) => key in e.components))
    },
  }
}
