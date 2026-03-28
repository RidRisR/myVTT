import type { ComponentType } from 'react'

/** Typed token for an extension point. Type info exists only at compile time. */
export interface ExtensionPoint<TProps> {
  readonly key: string
  /** Phantom field — never set at runtime, carries type info for TS only */
  readonly __phantom?: TProps
}

/** Create a typed extension point token (analogous to React createContext<T>()). */
export function createExtensionPoint<TProps>(key: string): ExtensionPoint<TProps> {
  return { key } as ExtensionPoint<TProps>
}

/** Convenience: create an extension point keyed by a log entry type (no dot in key). */
export function logRenderer(
  type: string,
): ExtensionPoint<{ entry: { type: string; payload: unknown } }> {
  return createExtensionPoint(type)
}

interface Contribution {
  component: ComponentType<never>
  priority: number
  insertionOrder: number
}

export class ExtensionRegistry {
  private map = new Map<string, Contribution[]>()

  /** Register a component contribution to an extension point. */
  contribute<T>(
    point: ExtensionPoint<T>,
    component: ComponentType<T>,
    priority = 0,
  ): void {
    const list = this.map.get(point.key) ?? []
    list.push({ component: component as ComponentType<never>, priority, insertionOrder: list.length })
    // Keep sorted by priority descending, insertion order ascending for stability
    list.sort((a, b) => b.priority - a.priority || a.insertionOrder - b.insertionOrder)
    this.map.set(point.key, list)
  }

  /** Get the highest-priority contribution, or undefined if none. */
  get<T>(point: ExtensionPoint<T>): ComponentType<T> | undefined {
    const list = this.map.get(point.key)
    return list?.[0]?.component as ComponentType<T> | undefined
  }

  /** Get all contributions sorted by priority (highest first). */
  getAll<T>(point: ExtensionPoint<T>): ComponentType<T>[] {
    const list = this.map.get(point.key)
    if (!list) return []
    return list.map((c) => c.component) as ComponentType<T>[]
  }
}
