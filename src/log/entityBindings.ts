// src/log/entityBindings.ts
// Entity display bindings — bridge between plugins and base UI components.
// Plugins register bindings via RendererRegistry; base UI calls these utilities.
// Data-driven: each binding's resolve() checks entity components and returns
// results only for entities it recognizes, so multiple plugins coexist safely.

import type React from 'react'
import type { Entity } from '../shared/entityTypes'
import type { ResourceView, StatusView, EntityCardProps } from '../rules/types'
import { createRendererPoint, getAllRenderers } from './rendererRegistry'

// ── Binding types ────────────────────────────────────────────────────────────

export interface MainResourceBinding {
  resolve: (entity: Entity) => ResourceView | null
}

export interface PortraitResourcesBinding {
  resolve: (entity: Entity) => ResourceView[]
}

export interface StatusBinding {
  resolve: (entity: Entity) => StatusView[]
}

export interface FormulaTokensBinding {
  resolve: (entity: Entity) => Record<string, number>
}

export interface EntityCardBinding {
  ruleSystemId: string
  component: React.ComponentType<EntityCardProps>
}

export interface DataTemplateBinding {
  ruleSystemId: string
  createDefaultEntityData: () => Record<string, unknown>
}

// ── RendererPoints ───────────────────────────────────────────────────────────

export const MAIN_RESOURCE_POINT = createRendererPoint<MainResourceBinding>(
  'entity',
  'main-resource',
)
export const PORTRAIT_RESOURCES_POINT = createRendererPoint<PortraitResourcesBinding>(
  'entity',
  'portrait-resources',
)
export const STATUS_POINT = createRendererPoint<StatusBinding>('entity', 'statuses')
export const FORMULA_TOKENS_POINT = createRendererPoint<FormulaTokensBinding>(
  'entity',
  'formula-tokens',
)
export const ENTITY_CARD_POINT = createRendererPoint<EntityCardBinding>('entity', 'entity-card')
export const DATA_TEMPLATE_POINT = createRendererPoint<DataTemplateBinding>(
  'entity',
  'data-template',
)

// ── Data-driven utility functions ────────────────────────────────────────────
// These iterate all registered bindings. Each binding's resolve() returns data
// only for entities whose components match (e.g., DH checks daggerheart:health,
// Generic checks rule:resources). No ruleSystemId filtering needed.

/** Get the main resource (first non-null result from any binding). */
export function getMainResource(entity: Entity): ResourceView | null {
  for (const binding of getAllRenderers(MAIN_RESOURCE_POINT)) {
    const result = binding.resolve(entity)
    if (result !== null) return result
  }
  return null
}

/** Get portrait resources (union of all binding results). */
export function getPortraitResources(entity: Entity): ResourceView[] {
  const results: ResourceView[] = []
  for (const binding of getAllRenderers(PORTRAIT_RESOURCES_POINT)) {
    results.push(...binding.resolve(entity))
  }
  return results
}

/** Get status views (union of all binding results). */
export function getStatuses(entity: Entity): StatusView[] {
  const results: StatusView[] = []
  for (const binding of getAllRenderers(STATUS_POINT)) {
    results.push(...binding.resolve(entity))
  }
  return results
}

/** Get formula tokens (merge all binding results; later bindings overwrite earlier keys). */
export function getFormulaTokens(entity: Entity): Record<string, number> {
  let merged: Record<string, number> = {}
  for (const binding of getAllRenderers(FORMULA_TOKENS_POINT)) {
    merged = { ...merged, ...binding.resolve(entity) }
  }
  return merged
}

// ── Room-level lookups (ruleSystemId-based) ──────────────────────────────────

/** Get EntityCard component for the given rule system. Returns null if none registered. */
export function getEntityCard(
  ruleSystemId: string,
): React.ComponentType<EntityCardProps> | null {
  const bindings = getAllRenderers(ENTITY_CARD_POINT)
  return bindings.find((b) => b.ruleSystemId === ruleSystemId)?.component ?? null
}

/** Get data template factory for the given rule system. */
export function getDataTemplate(
  ruleSystemId: string,
): (() => Record<string, unknown>) | undefined {
  const bindings = getAllRenderers(DATA_TEMPLATE_POINT)
  return bindings.find((b) => b.ruleSystemId === ruleSystemId)?.createDefaultEntityData
}
