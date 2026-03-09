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
  const rd = entity.ruleData as any
  if (!rd?.resources) return []
  if (Array.isArray(rd.resources)) return rd.resources
  return Object.entries(rd.resources).map(([key, val]: [string, any]) => ({
    key,
    current: val.cur ?? val.current ?? 0,
    max: val.max ?? 0,
    color: val.color ?? '#3b82f6',
  }))
}

export function getEntityAttributes(entity: Entity | null): AttributeView[] {
  if (!entity) return []
  const rd = entity.ruleData as any
  if (!rd?.attributes) return []
  if (Array.isArray(rd.attributes)) return rd.attributes
  return Object.entries(rd.attributes).map(([key, val]: [string, any]) => ({
    key,
    value: typeof val === 'number' ? val : (val?.value ?? 0),
    category: val?.category,
  }))
}

export function getEntityStatuses(entity: Entity | null): StatusView[] {
  if (!entity) return []
  const rd = entity.ruleData as any
  return rd?.statuses ?? []
}
