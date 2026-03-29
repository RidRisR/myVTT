// src/log/rendererRegistry.ts
import type React from 'react'
import type { GameLogEntry } from '../shared/logTypes'

export interface LogEntryRendererProps {
  entry: GameLogEntry
  isNew?: boolean
  animationStyle?: 'toast' | 'scroll'
}

export type LogEntryRenderer = React.ComponentType<LogEntryRendererProps>

const registry = new Map<string, LogEntryRenderer>()

function key(surface: string, type: string): string {
  return `${surface}::${type}`
}

export function registerRenderer(surface: string, type: string, renderer: LogEntryRenderer): void {
  const k = key(surface, type)
  if (registry.has(k)) {
    console.warn(
      `[RendererRegistry] Renderer for "${surface}::${type}" already registered, skipping`,
    )
    return
  }
  registry.set(k, renderer)
}

export function getRenderer(surface: string, type: string): LogEntryRenderer | undefined {
  return registry.get(key(surface, type))
}

export function clearRenderers(): void {
  registry.clear()
}
