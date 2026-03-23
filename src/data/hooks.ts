// src/data/hooks.ts
import { useWorldStore } from '../stores/worldStore'
import type { Entity } from '../shared/entityTypes'

/**
 * Reactive hook: subscribes to a single entity by ID.
 * Re-renders only when that specific entity changes (zustand selector).
 */
export function useEntity(id: string): Entity | undefined {
  return useWorldStore((s) => s.entities[id])
}

/**
 * Reactive hook: subscribes to a single component value on an entity.
 * Re-renders only when that component value changes.
 * Phase 4 will replace ruleData lookup with entity.components[key].
 */
export function useComponent<T>(entityId: string, key: string): T | undefined {
  return useWorldStore((s) => {
    const entity = s.entities[entityId]
    if (!entity) return undefined
    return (entity.ruleData as Record<string, unknown> | undefined)?.[key] as T | undefined
  })
}
