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
const registry = new Map<string, any>()

function key(surface: string, type: string): string {
  return `${surface}::${type}`
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
  if (registry.has(k)) {
    console.warn(`[RendererRegistry] "${k}" already registered, skipping`)
    return
  }
  registry.set(k, val)
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
  if (typeof pointOrSurface === 'string') {
    return registry.get(key(pointOrSurface, type!))
  }
  return registry.get(key(pointOrSurface.surface, pointOrSurface.type))
}

export function clearRenderers(): void {
  registry.clear()
}
