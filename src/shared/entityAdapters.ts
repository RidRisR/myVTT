// src/shared/entityAdapters.ts
// Temporary adapters until RuleSystem is fully implemented.
// These extract resources/attributes/statuses from entity.ruleData.
import type { Entity } from './entityTypes'

export interface ResourceView {
  key: string
  current: number
  max: number
  color: string
}

export interface AttributeView {
  key: string
  value: number
  category?: string
}

export interface StatusView {
  label: string
}

export function getEntityResources(entity: Entity | null): ResourceView[] {
  if (!entity) return []
  const rd = entity.ruleData as Record<string, unknown> | null
  if (!rd?.resources) return []
  if (Array.isArray(rd.resources)) return rd.resources as ResourceView[]
  return Object.entries(rd.resources as Record<string, Record<string, unknown>>).map(
    ([key, val]) => ({
      key,
      current: (val.cur ?? val.current ?? 0) as number,
      max: (val.max ?? 0) as number,
      color: (val.color ?? '#3b82f6') as string,
    }),
  )
}

export function getEntityAttributes(entity: Entity | null): AttributeView[] {
  if (!entity) return []
  const rd = entity.ruleData as Record<string, unknown> | null
  if (!rd?.attributes) return []
  if (Array.isArray(rd.attributes)) return rd.attributes as AttributeView[]
  return Object.entries(rd.attributes as Record<string, unknown>).map(([key, val]) => ({
    key,
    value:
      typeof val === 'number'
        ? val
        : (((val as Record<string, unknown> | null)?.value ?? 0) as number),
    category: (val as Record<string, unknown> | null)?.category as string | undefined,
  }))
}

export function getEntityStatuses(entity: Entity | null): StatusView[] {
  if (!entity) return []
  const rd = entity.ruleData as Record<string, unknown> | null
  return (rd?.statuses ?? []) as StatusView[]
}
