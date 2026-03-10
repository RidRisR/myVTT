import { renderHook, act } from '@testing-library/react'
import { useEntities } from '../useEntities'
import { createSyncedPair } from '../../__test-utils__/yjs-helpers'
import { makeEntity } from '../../__test-utils__/fixtures'

describe('useEntities — multi-client sync', () => {
  function setup() {
    const { doc1, doc2, world1, world2 } = createSyncedPair()
    const hook1 = renderHook(() => useEntities(world1, doc1))
    const hook2 = renderHook(() => useEntities(world2, doc2))
    return { doc1, doc2, world1, world2, hook1, hook2 }
  }

  it('Client A adds entity → Client B sees it', () => {
    const { hook1, hook2 } = setup()
    const entity = makeEntity({ id: 'pc-1', name: 'Fighter' })

    act(() => hook1.result.current.addEntity(entity))

    const found = hook2.result.current.entities.find((e) => e.id === 'pc-1')
    expect(found).toBeDefined()
    expect(found?.name).toBe('Fighter')
  })

  it('Client A updates entity name → Client B syncs', () => {
    const { hook1, hook2 } = setup()
    act(() => hook1.result.current.addEntity(makeEntity({ id: 'pc-1', name: 'Fighter' })))

    act(() => hook1.result.current.updateEntity('pc-1', { name: 'Paladin' }))

    expect(hook2.result.current.entities.find((e) => e.id === 'pc-1')?.name).toBe('Paladin')
  })

  it('Client A deletes entity → Client B syncs', () => {
    const { hook1, hook2 } = setup()
    act(() => hook1.result.current.addEntity(makeEntity({ id: 'pc-1' })))
    expect(hook2.result.current.entities.find((e) => e.id === 'pc-1')).toBeDefined()

    act(() => hook1.result.current.deleteEntity('pc-1'))

    expect(hook1.result.current.entities.find((e) => e.id === 'pc-1')).toBeUndefined()
    expect(hook2.result.current.entities.find((e) => e.id === 'pc-1')).toBeUndefined()
  })

  it('concurrent updates to different fields → both merge', () => {
    const { hook1, hook2 } = setup()
    act(() =>
      hook1.result.current.addEntity(makeEntity({ id: 'pc-1', name: 'Fighter', color: '#3b82f6' })),
    )

    // Doc1 updates name, Doc2 updates color — different Y.Map keys
    act(() => hook1.result.current.updateEntity('pc-1', { name: 'Paladin' }))
    act(() => hook2.result.current.updateEntity('pc-1', { color: '#ff0000' }))

    const e1 = hook1.result.current.entities.find((e) => e.id === 'pc-1')
    const e2 = hook2.result.current.entities.find((e) => e.id === 'pc-1')
    expect(e1?.name).toBe('Paladin')
    expect(e1?.color).toBe('#ff0000')
    expect(e2?.name).toBe('Paladin')
    expect(e2?.color).toBe('#ff0000')
  })
})
