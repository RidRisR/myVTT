import { renderHook, act } from '@testing-library/react'
import * as Y from 'yjs'
import { useShowcase } from '../useShowcase'
import type { ShowcaseItem } from '../showcaseTypes'

function makeItem(overrides?: Partial<ShowcaseItem>): ShowcaseItem {
  return {
    id: 'item-1',
    type: 'image',
    title: 'Map',
    imageUrl: '/img/map.jpg',
    senderId: 'seat-1',
    senderName: 'GM',
    senderColor: '#f00',
    ephemeral: false,
    timestamp: 1000,
    ...overrides,
  }
}

describe('useShowcase', () => {
  function setup() {
    const yDoc = new Y.Doc()
    const hook = renderHook(() => useShowcase(yDoc))
    return { yDoc, hook }
  }

  // ── CRUD ────────────────────────────────────────────────────

  it('starts with empty items', () => {
    const { hook } = setup()
    expect(hook.result.current.items).toEqual([])
  })

  it('adds an item', () => {
    const { hook } = setup()

    act(() => hook.result.current.addItem(makeItem()))

    expect(hook.result.current.items).toHaveLength(1)
    expect(hook.result.current.items[0].title).toBe('Map')
  })

  it('updates an item', () => {
    const { hook } = setup()
    act(() => hook.result.current.addItem(makeItem()))

    act(() => hook.result.current.updateItem('item-1', { title: 'Updated Map' }))

    expect(hook.result.current.items[0].title).toBe('Updated Map')
  })

  it('deletes an item', () => {
    const { hook } = setup()
    act(() => hook.result.current.addItem(makeItem()))

    act(() => hook.result.current.deleteItem('item-1'))

    expect(hook.result.current.items).toHaveLength(0)
  })

  it('sorts items by timestamp', () => {
    const { hook } = setup()

    act(() => {
      hook.result.current.addItem(makeItem({ id: 'b', timestamp: 2000 }))
      hook.result.current.addItem(makeItem({ id: 'a', timestamp: 1000 }))
      hook.result.current.addItem(makeItem({ id: 'c', timestamp: 3000 }))
    })

    expect(hook.result.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  // ── pin / unpin ─────────────────────────────────────────────

  it('pins an item', () => {
    const { hook } = setup()
    act(() => hook.result.current.addItem(makeItem()))

    act(() => hook.result.current.pinItem('item-1'))

    expect(hook.result.current.pinnedItemId).toBe('item-1')
  })

  it('unpins an item', () => {
    const { hook } = setup()
    act(() => {
      hook.result.current.addItem(makeItem())
      hook.result.current.pinItem('item-1')
    })

    act(() => hook.result.current.unpinItem())

    expect(hook.result.current.pinnedItemId).toBeNull()
  })

  it('auto-unpins when pinned item is deleted', () => {
    const { hook } = setup()
    act(() => {
      hook.result.current.addItem(makeItem())
      hook.result.current.pinItem('item-1')
    })
    expect(hook.result.current.pinnedItemId).toBe('item-1')

    act(() => hook.result.current.deleteItem('item-1'))

    expect(hook.result.current.pinnedItemId).toBeNull()
  })

  // ── clearAll ────────────────────────────────────────────────

  it('clears all items and unpins', () => {
    const { hook } = setup()
    act(() => {
      hook.result.current.addItem(makeItem({ id: 'a', timestamp: 1 }))
      hook.result.current.addItem(makeItem({ id: 'b', timestamp: 2 }))
      hook.result.current.pinItem('a')
    })

    act(() => hook.result.current.clearAll())

    expect(hook.result.current.items).toHaveLength(0)
    expect(hook.result.current.pinnedItemId).toBeNull()
  })
})
