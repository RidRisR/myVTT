// src/log/rendererRegistry.ts
import type React from 'react'
import type { GameLogEntry } from '../shared/logTypes'

export interface LogEntryRendererProps {
  entry: GameLogEntry
  isNew?: boolean
  animationStyle?: 'toast' | 'scroll'
}

export type LogEntryRenderer = React.ComponentType<LogEntryRendererProps>

/** Typed token for a renderer extension point. __phantom carries type info at compile time only. */
export interface RendererPoint<T> {
  readonly surface: string
  readonly type: string
  readonly __phantom?: T
}

/** Create a typed renderer point token. */
export function createRendererPoint<T>(surface: string, type: string): RendererPoint<T> {
  return { surface, type } as RendererPoint<T>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, any[]>()

/** Surfaces that support multiple registrations under the same key. */
const multiSurfaces = new Set(['entity', 'combat', 'ui-slot'])

function key(surface: string, type: string): string {
  return `${surface}::${type}`
}

/** Check if a registry key belongs to a multi-registration surface. */
function isMultiKey(k: string): boolean {
  const colonIdx = k.indexOf('::')
  if (colonIdx === -1) return false
  return multiSurfaces.has(k.slice(0, colonIdx))
}

// Overload: typed token API
export function registerRenderer<T>(point: RendererPoint<T>, value: T): void
// Overload: legacy string API (backward compat)
export function registerRenderer(surface: string, type: string, renderer: LogEntryRenderer): void
// Implementation
export function registerRenderer<T>(
  pointOrSurface: RendererPoint<T> | string,
  valueOrType: T | string,
  renderer?: LogEntryRenderer,
): void {
  let k: string
  let val: unknown
  if (typeof pointOrSurface === 'string') {
    k = key(pointOrSurface, valueOrType as string)
    val = renderer
  } else {
    k = key(pointOrSurface.surface, pointOrSurface.type)
    val = valueOrType
  }

  const existing = registry.get(k)
  if (existing) {
    if (isMultiKey(k)) {
      // Multi-surface: accumulate
      existing.push(val)
      return
    }
    // Non-multi surface: warn and skip (backward compat)
    console.warn(`[RendererRegistry] "${k}" already registered, skipping`)
    return
  }
  registry.set(k, [val])
}

// Overload: typed token API
export function getRenderer<T>(point: RendererPoint<T>): T | undefined
// Overload: legacy string API
export function getRenderer(surface: string, type: string): LogEntryRenderer | undefined
// Implementation
export function getRenderer<T>(
  pointOrSurface: RendererPoint<T> | string,
  type?: string,
): T | LogEntryRenderer | undefined {
  let arr: unknown[] | undefined
  if (typeof pointOrSurface === 'string') {
    arr = registry.get(key(pointOrSurface, type ?? ''))
  } else {
    arr = registry.get(key(pointOrSurface.surface, pointOrSurface.type))
  }
  return arr?.[0] as (T & LogEntryRenderer) | undefined
}

// Overload: typed token API
export function getAllRenderers<T>(point: RendererPoint<T>): T[]
// Overload: string API
export function getAllRenderers(surface: string, type: string): unknown[]
// Implementation
export function getAllRenderers<T>(
  pointOrSurface: RendererPoint<T> | string,
  type?: string,
): T[] | unknown[] {
  let arr: unknown[] | undefined
  if (typeof pointOrSurface === 'string') {
    arr = registry.get(key(pointOrSurface, type ?? ''))
  } else {
    arr = registry.get(key(pointOrSurface.surface, pointOrSurface.type))
  }
  return (arr ? [...arr] : []) as T[]
}

export function clearRenderers(): void {
  registry.clear()
}

const CHAT_SURFACE_PREFIX = 'chat::'

/** Get all entry types that have a registered 'chat' surface renderer */
export function getChatVisibleTypes(): Set<string> {
  const types = new Set<string>()
  for (const k of registry.keys()) {
    if (k.startsWith(CHAT_SURFACE_PREFIX)) {
      types.add(k.slice(CHAT_SURFACE_PREFIX.length))
    }
  }
  return types
}
