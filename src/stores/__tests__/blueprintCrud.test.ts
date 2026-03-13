import { describe, it, expect } from 'vitest'
import { act } from '@testing-library/react'
import * as Y from 'yjs'
import { useWorldStore } from '../worldStore'
import { makeBlueprint } from '../../__test-utils__/fixtures'

function initWorldStore(yDoc: Y.Doc) {
  return useWorldStore.getState().init(yDoc)
}

describe('blueprint CRUD via worldStore', () => {
  it('addBlueprint writes to Yjs and observer updates store', () => {
    const yDoc = new Y.Doc()
    const cleanup = initWorldStore(yDoc)

    const bp = makeBlueprint({ id: 'bp-1', name: 'Goblin' })

    act(() => useWorldStore.getState().addBlueprint(bp))

    const state = useWorldStore.getState()
    expect(state.blueprints).toHaveLength(1)
    expect(state.blueprints[0].id).toBe('bp-1')
    expect(state.blueprints[0].name).toBe('Goblin')
    expect(state.blueprints[0].defaultSize).toBe(1)
    expect(state.blueprints[0].defaultColor).toBe('#22c55e')

    cleanup()
  })

  it('updateBlueprint merges partial updates', () => {
    const yDoc = new Y.Doc()
    const cleanup = initWorldStore(yDoc)

    act(() => useWorldStore.getState().addBlueprint(makeBlueprint({ id: 'bp-1', name: 'Goblin' })))
    act(() =>
      useWorldStore.getState().updateBlueprint('bp-1', { name: 'Hobgoblin', defaultSize: 2 }),
    )

    const bp = useWorldStore.getState().blueprints.find((b) => b.id === 'bp-1')
    expect(bp?.name).toBe('Hobgoblin')
    expect(bp?.defaultSize).toBe(2)
    // Unchanged fields preserved
    expect(bp?.defaultColor).toBe('#22c55e')

    cleanup()
  })

  it('updateBlueprint does nothing for non-existent id', () => {
    const yDoc = new Y.Doc()
    const cleanup = initWorldStore(yDoc)

    act(() => useWorldStore.getState().addBlueprint(makeBlueprint({ id: 'bp-1' })))
    act(() => useWorldStore.getState().updateBlueprint('bp-999', { name: 'Ghost' }))

    expect(useWorldStore.getState().blueprints).toHaveLength(1)
    expect(useWorldStore.getState().blueprints[0].id).toBe('bp-1')

    cleanup()
  })

  it('deleteBlueprint removes from store', () => {
    const yDoc = new Y.Doc()
    const cleanup = initWorldStore(yDoc)

    act(() => {
      useWorldStore.getState().addBlueprint(makeBlueprint({ id: 'bp-1' }))
      useWorldStore.getState().addBlueprint(makeBlueprint({ id: 'bp-2', name: 'Orc' }))
    })
    expect(useWorldStore.getState().blueprints).toHaveLength(2)

    act(() => useWorldStore.getState().deleteBlueprint('bp-1'))

    const remaining = useWorldStore.getState().blueprints
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('bp-2')

    cleanup()
  })

  it('blueprints sync between two clients', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    // Bidirectional sync
    doc1.on('update', (update: Uint8Array) => Y.applyUpdate(doc2, update))
    doc2.on('update', (update: Uint8Array) => Y.applyUpdate(doc1, update))

    const cleanup1 = initWorldStore(doc1)

    act(() => {
      useWorldStore.getState().addBlueprint(makeBlueprint({ id: 'bp-sync', name: 'Dragon' }))
    })

    cleanup1()

    // Init store on doc2 — blueprint should already be there via sync
    const cleanup2 = initWorldStore(doc2)

    const state = useWorldStore.getState()
    expect(state.blueprints).toHaveLength(1)
    expect(state.blueprints[0].id).toBe('bp-sync')
    expect(state.blueprints[0].name).toBe('Dragon')

    cleanup2()
  })

  it('id is reconstructed from Y.Map key, not stored in value', () => {
    const yDoc = new Y.Doc()
    const cleanup = initWorldStore(yDoc)

    act(() => useWorldStore.getState().addBlueprint(makeBlueprint({ id: 'bp-key' })))

    // Verify the Yjs map stores data without id in value
    const yBlueprints = yDoc.getMap('blueprints')
    const stored = yBlueprints.get('bp-key') as Record<string, unknown>
    expect(stored).toBeDefined()
    expect(stored.id).toBeUndefined()

    // But zustand state has id reconstructed from key
    expect(useWorldStore.getState().blueprints[0].id).toBe('bp-key')

    cleanup()
  })
})
