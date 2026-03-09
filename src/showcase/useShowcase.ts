import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import type { ShowcaseItem } from './showcaseTypes'

function readItems(yShowcase: Y.Map<ShowcaseItem>): ShowcaseItem[] {
  const items: ShowcaseItem[] = []
  yShowcase.forEach((item) => items.push(item))
  items.sort((a, b) => a.timestamp - b.timestamp)
  return items
}

export function useShowcase(yDoc: Y.Doc) {
  const yShowcase = yDoc.getMap<ShowcaseItem>('showcase_items')
  const yRoom = yDoc.getMap<unknown>('room')
  const [items, setItems] = useState<ShowcaseItem[]>(() => readItems(yShowcase))
  const [newItemId, setNewItemId] = useState<string | null>(null)
  const [pinnedItemId, setPinnedItemId] = useState<string | null>(
    () => (yRoom.get('pinnedShowcaseId') as string) ?? null,
  )
  const prevIdsRef = useRef<Set<string>>(new Set(items.map((i) => i.id)))

  useEffect(() => {
    const observer = () => {
      const nextItems = readItems(yShowcase)
      setItems(nextItems)

      // Detect newly added item
      const nextIds = new Set(nextItems.map((i) => i.id))
      for (const id of nextIds) {
        if (!prevIdsRef.current.has(id)) {
          setNewItemId(id)
          break
        }
      }
      prevIdsRef.current = nextIds
    }
    setItems(readItems(yShowcase))
    prevIdsRef.current = new Set(readItems(yShowcase).map((i) => i.id))
    yShowcase.observe(observer)
    return () => yShowcase.unobserve(observer)
  }, [yShowcase])

  // Listen for pinnedShowcaseId changes from room map
  useEffect(() => {
    const observer = () => {
      setPinnedItemId((yRoom.get('pinnedShowcaseId') as string) ?? null)
    }
    yRoom.observe(observer)
    return () => yRoom.unobserve(observer)
  }, [yRoom])

  const addItem = (item: ShowcaseItem) => {
    yShowcase.set(item.id, item)
  }

  const updateItem = (id: string, updates: Partial<ShowcaseItem>) => {
    const existing = yShowcase.get(id)
    if (existing) {
      yShowcase.set(id, { ...existing, ...updates })
    }
  }

  const deleteItem = (id: string) => {
    yShowcase.delete(id)
    // If deleting the pinned item, unpin
    if ((yRoom.get('pinnedShowcaseId') as string) === id) {
      yRoom.delete('pinnedShowcaseId')
    }
  }

  const clearAll = () => {
    yDoc.transact(() => {
      yShowcase.forEach((_val, key) => yShowcase.delete(key))
      yRoom.delete('pinnedShowcaseId')
    })
  }

  const pinItem = (id: string) => {
    yRoom.set('pinnedShowcaseId', id)
  }

  const unpinItem = () => {
    yRoom.delete('pinnedShowcaseId')
  }

  const clearNewItemId = useCallback(() => setNewItemId(null), [])

  return {
    items,
    addItem,
    updateItem,
    deleteItem,
    clearAll,
    newItemId,
    clearNewItemId,
    pinnedItemId,
    pinItem,
    unpinItem,
  }
}
