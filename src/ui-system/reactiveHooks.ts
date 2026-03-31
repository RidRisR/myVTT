// src/ui-system/reactiveHooks.ts
// Factory functions that create reactive hooks backed by store subscriptions.
// Plugins access these via sdk.data / sdk.log / sdk.awareness — never import this file directly.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Entity } from '../shared/entityTypes'
import type { ComponentTypeMap } from '../shared/componentTypes'
import type { GameLogEntry } from '../shared/logTypes'
import type { IReactiveDataSDK, LogEntriesResult } from './types'

// ── Data hooks ──

type GetEntities = () => Record<string, Entity>
type Subscribe = (listener: () => void) => () => void

export function createReactiveDataSDK(
  getEntities: GetEntities,
  subscribe: Subscribe,
): IReactiveDataSDK {
  return {
    useEntity(entityId: string): Entity | undefined {
      return useSyncExternalStore(subscribe, () => getEntities()[entityId])
    },

    useComponent<K extends keyof ComponentTypeMap>(
      entityId: string,
      key: K,
    ): ComponentTypeMap[K] | undefined {
      return useSyncExternalStore(subscribe, () => {
        const entity = getEntities()[entityId]
        return entity?.components[key] as ComponentTypeMap[K] | undefined
      })
    },

    useQuery(spec: { has?: string[] }): Entity[] {
      const keys = spec.has
      const cacheRef = useRef<{ entities: Entity[]; signature: string }>({
        entities: [],
        signature: '',
      })

      const getSnapshot = useCallback(() => {
        const allEntities = getEntities()
        const values = Object.values(allEntities)
        const filtered =
          keys && keys.length > 0
            ? values.filter((e) => keys.every((k) => k in e.components))
            : values

        // Build a signature from entity ids + references to detect changes
        const ids = filtered.map((e) => e.id).sort()
        const sig = ids.join('\0')

        // If signature matches AND all entity references are the same, return cached
        if (sig === cacheRef.current.signature) {
          const prev = cacheRef.current.entities
          const same = prev.length === filtered.length && prev.every((e, i) => e === filtered[i])
          if (same) return cacheRef.current.entities
        }

        cacheRef.current = { entities: filtered, signature: sig }
        return filtered
        // eslint-disable-next-line react-hooks/exhaustive-deps -- keys is derived from spec.has, stable per call site
      }, [keys?.join('\0')])

      return useSyncExternalStore(subscribe, getSnapshot)
    },
  }
}

// ── Log hooks ──

type GetLogEntries = () => GameLogEntry[]

export function createLogHooks(
  getLogEntries: GetLogEntries,
  subscribe: Subscribe,
): { useEntries: (pattern: string, options?: { limit?: number }) => LogEntriesResult } {
  return {
    useEntries(pattern: string, options?: { limit?: number }): LogEntriesResult {
      // Record watermark at mount time — entries with seq > this are "new"
      const mountSeqRef = useRef<number>(-1)
      if (mountSeqRef.current === -1) {
        const entries = getLogEntries()
        mountSeqRef.current = entries.length > 0 ? entries[entries.length - 1].seq : 0
      }

      const getSnapshot = useCallback(() => {
        return getLogEntries()
      }, [])

      const allEntries = useSyncExternalStore(subscribe, getSnapshot)

      // Filter + limit + compute newIds
      const [filtered, newIds] = useFilteredEntries(
        allEntries,
        pattern,
        options?.limit,
        mountSeqRef.current,
      )

      return { entries: filtered, newIds }
    },
  }
}

/** Memoized filter + newIds computation to avoid re-creating arrays on every render */
function useFilteredEntries(
  allEntries: GameLogEntry[],
  pattern: string,
  limit: number | undefined,
  mountSeq: number,
): [GameLogEntry[], ReadonlySet<string>] {
  const cacheRef = useRef<{
    input: GameLogEntry[]
    pattern: string
    limit: number | undefined
    filtered: GameLogEntry[]
    newIds: ReadonlySet<string>
  }>({ input: [], pattern: '', limit: undefined, filtered: [], newIds: new Set() })

  if (
    cacheRef.current.input === allEntries &&
    cacheRef.current.pattern === pattern &&
    cacheRef.current.limit === limit
  ) {
    return [cacheRef.current.filtered, cacheRef.current.newIds]
  }

  let filtered = allEntries.filter((e) => e.type === pattern)
  if (limit !== undefined) {
    filtered = filtered.slice(-limit)
  }

  const newIds = new Set<string>()
  for (const e of filtered) {
    if (e.seq > mountSeq) newIds.add(e.id)
  }

  cacheRef.current = { input: allEntries, pattern, limit, filtered, newIds }
  return [filtered, newIds]
}

// ── Awareness hooks ──

type AwarenessSubscribeFn = <T>(
  channel: { readonly key: string; readonly __phantom?: T },
  handler: (seatId: string, state: T | null) => void,
) => () => void

export function createAwarenessHooks(subscribeFn: AwarenessSubscribeFn): {
  usePeers: <T>(channel: { readonly key: string; readonly __phantom?: T }) => ReadonlyMap<string, T>
} {
  return {
    usePeers<T>(channel: { readonly key: string; readonly __phantom?: T }): ReadonlyMap<string, T> {
      const [peers, setPeers] = useState<ReadonlyMap<string, T>>(() => new Map())

      useEffect(() => {
        const unsub = subscribeFn(channel, (seatId: string, state: T | null) => {
          setPeers((prev) => {
            const next = new Map(prev)
            if (state === null) {
              next.delete(seatId)
            } else {
              next.set(seatId, state)
            }
            return next
          })
        })
        return unsub
        // eslint-disable-next-line react-hooks/exhaustive-deps -- channel.key is the stable identity
      }, [channel.key])

      return peers
    },
  }
}
