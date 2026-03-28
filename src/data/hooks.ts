// src/data/hooks.ts
import { useWorldStore } from '../stores/worldStore'
import type { Entity } from '../shared/entityTypes'
import type { ComponentTypeMap } from '../shared/componentTypes'

/**
 * Reactive hook: subscribes to a single entity by ID.
 * Re-renders only when that specific entity changes (zustand selector).
 */
export function useEntity(id: string): Entity | undefined {
  return useWorldStore((s) => s.entities[id])
}

/**
 * Reactive hook: subscribes to a single component value on an entity.
 * Known keys (in ComponentTypeMap) auto-infer return type.
 * Unknown keys fall back to explicit generic T.
 */
export function useComponent<K extends keyof ComponentTypeMap>(
  entityId: string,
  key: K,
): ComponentTypeMap[K] | undefined
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- fallback overload requires standalone T
export function useComponent<T = unknown>(entityId: string, key: string): T | undefined
export function useComponent(entityId: string, key: string) {
  return useWorldStore((s) => {
    const entity = s.entities[entityId]
    if (!entity) return undefined
    return entity.components[key]
  })
}
