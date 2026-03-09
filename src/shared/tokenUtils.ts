import type { Resource, Attribute, Status } from './tokenTypes'

export type { Resource, Attribute, Status }

export const BAR_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899']

export function barColorForKey(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0
  return BAR_COLORS[Math.abs(hash) % BAR_COLORS.length]
}

const STATUS_COLORS = [
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#65a30d',
  '#059669',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#c026d3',
  '#e11d48',
]

export function statusColor(label: string): string {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = ((hash << 5) - hash + label.charCodeAt(i)) | 0
  return STATUS_COLORS[Math.abs(hash) % STATUS_COLORS.length]
}

/** Read resources from shape.meta, with safe defaults */
export function readResources(raw: unknown): Resource[] {
  if (!Array.isArray(raw)) return []
  return raw as Resource[]
}

/** Read attributes from shape.meta, with safe defaults */
export function readAttributes(raw: unknown): Attribute[] {
  if (!Array.isArray(raw)) return []
  return raw as Attribute[]
}

/** Read statuses from shape.meta, with safe defaults */
export function readStatuses(raw: unknown): Status[] {
  if (!Array.isArray(raw)) return []
  return raw as Status[]
}
