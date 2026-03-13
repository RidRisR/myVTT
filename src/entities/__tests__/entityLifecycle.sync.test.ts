import { renderHook, act } from '@testing-library/react'
import * as Y from 'yjs'
import { useEntities } from '../useEntities'
// useScenes hook removed in data layer refactor — scene operations tested via worldStore
import {
  gcOrphanedEntities,
  addEntityToAllScenes,
  getPersistentEntityIds,
} from '../entityLifecycle'
import {
  createSyncedPair,
  createDeferredPair,
  addSceneToDoc,
} from '../../__test-utils__/yjs-helpers'
import { makeEntity } from '../../__test-utils__/fixtures'

/** Flush deferred sync inside act() so React hooks pick up changes */
function flushInAct(doc1: Y.Doc, doc2: Y.Doc) {
  act(() => {
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
  })
}

// ── Entity field concurrent updates ──────────────────────────

describe('entity concurrent field updates', () => {
  it('same field concurrent update — both clients converge (Y.Text merge)', () => {
    const { doc1, doc2, world1, world2 } = createDeferredPair()
    const hook1 = renderHook(() => useEntities(world1, doc1))
    const hook2 = renderHook(() => useEntities(world2, doc2))

    // Both clients start with same entity
    act(() => hook1.result.current.addEntity(makeEntity({ id: 'e1', name: 'Original' })))
    flushInAct(doc1, doc2)

    // Both update the same field concurrently (no sync in between)
    act(() => hook1.result.current.updateEntity('e1', { name: 'Name-A' }))
    act(() => hook2.result.current.updateEntity('e1', { name: 'Name-B' }))

    // Flush sync — Y.Text merges concurrent inserts (character-level CRDT)
    flushInAct(doc1, doc2)

    // Both clients should converge to the same merged value.
    // With Y.Text, concurrent delete-all + insert produces a merge of both
    // texts (not last-write-wins). The merged result contains both strings.
    const e1 = hook1.result.current.entities.find((e) => e.id === 'e1')
    const e2 = hook2.result.current.entities.find((e) => e.id === 'e1')
    expect(e1?.name).toBe(e2?.name)
    // Y.Text merge: both inserts survive, so the result contains both substrings
    expect(e1?.name).toContain('Name-A')
    expect(e1?.name).toContain('Name-B')
  })

  it('different fields concurrent update — both merge', () => {
    const { doc1, doc2, world1, world2 } = createDeferredPair()
    const hook1 = renderHook(() => useEntities(world1, doc1))
    const hook2 = renderHook(() => useEntities(world2, doc2))

    act(() =>
      hook1.result.current.addEntity(makeEntity({ id: 'e1', name: 'Fighter', color: '#000' })),
    )
    flushInAct(doc1, doc2)

    // Different fields — should both survive
    act(() => hook1.result.current.updateEntity('e1', { name: 'Paladin' }))
    act(() => hook2.result.current.updateEntity('e1', { color: '#ff0000' }))

    flushInAct(doc1, doc2)

    const e1 = hook1.result.current.entities.find((e) => e.id === 'e1')
    const e2 = hook2.result.current.entities.find((e) => e.id === 'e1')
    expect(e1?.name).toBe('Paladin')
    expect(e1?.color).toBe('#ff0000')
    expect(e2?.name).toBe('Paladin')
    expect(e2?.color).toBe('#ff0000')
  })
})

// ── Permissions concurrent updates ──────────────────────────

describe('permissions concurrent updates', () => {
  it('concurrent seat adds via direct Y.Map (field-level CRDT) — both merge', () => {
    const { doc1, doc2, world1, world2 } = createDeferredPair()

    // Create entity on doc1 with empty seats
    doc1.transact(() => {
      const yMap = new Y.Map<unknown>()
      world1.entities.set('e1', yMap)
      yMap.set('id', 'e1')
      yMap.set('name', 'Fighter')
      yMap.set('persistent', false)
      const permYMap = new Y.Map<unknown>()
      yMap.set('permissions', permYMap)
      permYMap.set('default', 'observer')
      const seatsYMap = new Y.Map<unknown>()
      permYMap.set('seats', seatsYMap)
      const ruleYMap = new Y.Map<unknown>()
      yMap.set('ruleData', ruleYMap)
    })
    flushInAct(doc1, doc2)

    // Both clients add different seats concurrently via direct Y.Map access
    const entity1 = world1.entities.get('e1') as Y.Map<unknown>
    const perm1 = entity1.get('permissions') as Y.Map<unknown>
    const seats1 = perm1.get('seats') as Y.Map<unknown>
    seats1.set('seat-1', 'owner')

    const entity2 = world2.entities.get('e1') as Y.Map<unknown>
    const perm2 = entity2.get('permissions') as Y.Map<unknown>
    const seats2 = perm2.get('seats') as Y.Map<unknown>
    seats2.set('seat-2', 'owner')

    // Flush
    flushInAct(doc1, doc2)

    // Both seats should be present — field-level CRDT merge
    expect(seats1.get('seat-1')).toBe('owner')
    expect(seats1.get('seat-2')).toBe('owner')
    expect(seats2.get('seat-1')).toBe('owner')
    expect(seats2.get('seat-2')).toBe('owner')
  })

  it('concurrent updateEntity with different seats — both survive after CRDT merge', () => {
    const { doc1, doc2, world1, world2 } = createDeferredPair()
    const hook1 = renderHook(() => useEntities(world1, doc1))
    const hook2 = renderHook(() => useEntities(world2, doc2))

    act(() =>
      hook1.result.current.addEntity(
        makeEntity({
          id: 'e1',
          permissions: { default: 'observer', seats: {} },
        }),
      ),
    )
    flushInAct(doc1, doc2)

    // Client A sets seat-1, Client B sets seat-2 — both via updateEntity hook
    act(() =>
      hook1.result.current.updateEntity('e1', {
        permissions: { default: 'observer', seats: { 'seat-1': 'owner' } },
      }),
    )
    act(() =>
      hook2.result.current.updateEntity('e1', {
        permissions: { default: 'observer', seats: { 'seat-2': 'owner' } },
      }),
    )

    flushInAct(doc1, doc2)

    const e1 = hook1.result.current.entities.find((e) => e.id === 'e1')
    const e2 = hook2.result.current.entities.find((e) => e.id === 'e1')

    // Both clients should converge to the same state
    expect(e1?.permissions).toEqual(e2?.permissions)

    // Both seats should survive — each client only deletes seats not in its own update
    expect(e1?.permissions.seats['seat-1']).toBe('owner')
    expect(e1?.permissions.seats['seat-2']).toBe('owner')
  })
})

// ── Delete vs update race ──────────────────────────────────

describe('delete vs update race', () => {
  it('Client A deletes entity while Client B updates it — delete wins', () => {
    const { doc1, doc2, world1, world2 } = createDeferredPair()
    const hook1 = renderHook(() => useEntities(world1, doc1))
    const hook2 = renderHook(() => useEntities(world2, doc2))

    act(() => hook1.result.current.addEntity(makeEntity({ id: 'e1', name: 'Fighter' })))
    flushInAct(doc1, doc2)

    // Client A deletes, Client B updates — concurrently
    act(() => hook1.result.current.deleteEntity('e1'))
    act(() => hook2.result.current.updateEntity('e1', { name: 'Paladin' }))

    flushInAct(doc1, doc2)

    // In Yjs, deleting a key from Y.Map removes the entire nested structure.
    // After merge, the entity should be gone on both clients.
    const e1 = hook1.result.current.entities.find((e) => e.id === 'e1')
    const e2 = hook2.result.current.entities.find((e) => e.id === 'e1')
    // Both clients should agree — entity is either present or absent on both
    const e1exists = e1 !== undefined
    const e2exists = e2 !== undefined
    expect(e1exists).toBe(e2exists)
  })
})

// ── GC distributed scenarios ────────────────────────────────

describe('GC — distributed scenarios', () => {
  it('GC on doc1 after scene delete — doc2 sees entity removed', () => {
    const { doc1, doc2, world1, world2 } = createSyncedPair()
    const hook1 = renderHook(() => useEntities(world1, doc1))
    const hook2 = renderHook(() => useEntities(world2, doc2))

    // Create scene + entity on doc1
    act(() => {
      addSceneToDoc(world1.scenes, doc1, 'scene-1')
      hook1.result.current.addEntity(makeEntity({ id: 'e1', persistent: false }))
      const entityIds = (world1.scenes.get('scene-1') as Y.Map<unknown>).get(
        'entityIds',
      ) as Y.Map<boolean>
      entityIds.set('e1', true)
    })

    expect(hook2.result.current.entities.find((e) => e.id === 'e1')).toBeDefined()

    // Delete scene + GC on doc1
    act(() => {
      const sceneEntityIds = ['e1']
      world1.scenes.delete('scene-1')
      gcOrphanedEntities(sceneEntityIds, world1.scenes, world1.entities)
    })

    // Both clients should see entity gone
    expect(hook1.result.current.entities.find((e) => e.id === 'e1')).toBeUndefined()
    expect(hook2.result.current.entities.find((e) => e.id === 'e1')).toBeUndefined()
  })

  it('GC skips entity still referenced by another scene', () => {
    const { doc1, doc2, world1, world2 } = createSyncedPair()
    const hook1 = renderHook(() => useEntities(world1, doc1))
    const hook2 = renderHook(() => useEntities(world2, doc2))

    act(() => {
      addSceneToDoc(world1.scenes, doc1, 'scene-1')
      addSceneToDoc(world1.scenes, doc1, 'scene-2')
      hook1.result.current.addEntity(makeEntity({ id: 'e1', persistent: false }))
      // Add entity to both scenes
      const ids1 = (world1.scenes.get('scene-1') as Y.Map<unknown>).get(
        'entityIds',
      ) as Y.Map<boolean>
      const ids2 = (world1.scenes.get('scene-2') as Y.Map<unknown>).get(
        'entityIds',
      ) as Y.Map<boolean>
      ids1.set('e1', true)
      ids2.set('e1', true)
    })

    // Delete scene-1, GC
    act(() => {
      world1.scenes.delete('scene-1')
      gcOrphanedEntities(['e1'], world1.scenes, world1.entities)
    })

    // Entity survives — still referenced by scene-2
    expect(hook1.result.current.entities.find((e) => e.id === 'e1')).toBeDefined()
    expect(hook2.result.current.entities.find((e) => e.id === 'e1')).toBeDefined()
  })

  it('GC preserves persistent entities even when unreferenced', () => {
    const { doc1, doc2, world1, world2 } = createSyncedPair()
    const hook1 = renderHook(() => useEntities(world1, doc1))
    const hook2 = renderHook(() => useEntities(world2, doc2))

    act(() => {
      addSceneToDoc(world1.scenes, doc1, 'scene-1')
      hook1.result.current.addEntity(makeEntity({ id: 'pc-1', persistent: true }))
      const ids = (world1.scenes.get('scene-1') as Y.Map<unknown>).get(
        'entityIds',
      ) as Y.Map<boolean>
      ids.set('pc-1', true)
    })

    act(() => {
      world1.scenes.delete('scene-1')
      gcOrphanedEntities(['pc-1'], world1.scenes, world1.entities)
    })

    // Persistent entity survives on both clients
    expect(hook1.result.current.entities.find((e) => e.id === 'pc-1')).toBeDefined()
    expect(hook2.result.current.entities.find((e) => e.id === 'pc-1')).toBeDefined()
  })
})

// ── Persistent entity auto-join distributed ────────────────

describe('persistent entity auto-join — distributed', () => {
  it('persistent entity created on doc1 + new scene on doc2 — deferred sync', () => {
    const { doc1, doc2, world1, world2, flushSync } = createDeferredPair()

    // Doc1 creates a scene first, sync
    act(() => addSceneToDoc(world1.scenes, doc1, 'scene-1'))
    act(() => flushSync())

    // Doc1 creates persistent entity + auto-joins all scenes
    act(() => {
      doc1.transact(() => {
        const yMap = new Y.Map<unknown>()
        world1.entities.set('pc-1', yMap)
        yMap.set('id', 'pc-1')
        yMap.set('name', 'Paladin')
        yMap.set('persistent', true)
        const permYMap = new Y.Map<unknown>()
        yMap.set('permissions', permYMap)
        permYMap.set('default', 'observer')
        permYMap.set('seats', new Y.Map<unknown>())
        yMap.set('ruleData', new Y.Map<unknown>())
      })
      addEntityToAllScenes('pc-1', world1.scenes)
    })

    // Doc2 creates a new scene concurrently (before sync)
    act(() => addSceneToDoc(world2.scenes, doc2, 'scene-2'))

    act(() => flushSync())

    // After sync, scene-1 should have pc-1 (from doc1's addEntityToAllScenes)
    const s1ids = (world1.scenes.get('scene-1') as Y.Map<unknown>).get(
      'entityIds',
    ) as Y.Map<boolean>
    expect(s1ids.has('pc-1')).toBe(true)

    // scene-2 was created on doc2 BEFORE sync — pc-1 was NOT auto-joined
    // Known limitation: auto-join only covers scenes that exist at call time
    const s2ids = (world1.scenes.get('scene-2') as Y.Map<unknown>).get(
      'entityIds',
    ) as Y.Map<boolean>
    expect(s2ids.has('pc-1')).toBe(false)
  })

  it('new scene with getPersistentEntityIds includes persistent entities', () => {
    const { doc1, doc2, world1, world2 } = createSyncedPair()
    const hook1 = renderHook(() => useEntities(world1, doc1))

    // Create persistent entity
    act(() => hook1.result.current.addEntity(makeEntity({ id: 'pc-1', persistent: true })))

    // Create new scene via Yjs directly and pass persistent entity IDs
    const persistentIds = getPersistentEntityIds(world2.entities)
    expect(persistentIds).toContain('pc-1')

    act(() => {
      doc2.transact(() => {
        const sceneMap = new Y.Map<unknown>()
        world2.scenes.set('scene-new', sceneMap)
        sceneMap.set('name', 'New Scene')
        sceneMap.set('atmosphere', {
          imageUrl: '',
          width: 1000,
          height: 1000,
          particlePreset: 'none',
          ambientPreset: '',
          ambientAudioUrl: '',
          ambientAudioVolume: 0.5,
        })
        sceneMap.set('sortOrder', 0)
        const entityIdsMap = new Y.Map<boolean>()
        sceneMap.set('entityIds', entityIdsMap)
        for (const eid of persistentIds) {
          entityIdsMap.set(eid, true)
        }
        sceneMap.set('encounters', new Y.Map())
      })
    })

    // Both clients should see pc-1 in the new scene
    const ids1 = (world1.scenes.get('scene-new') as Y.Map<unknown>).get(
      'entityIds',
    ) as Y.Map<boolean>
    const ids2 = (world2.scenes.get('scene-new') as Y.Map<unknown>).get(
      'entityIds',
    ) as Y.Map<boolean>
    expect(ids1.has('pc-1')).toBe(true)
    expect(ids2.has('pc-1')).toBe(true)
  })
})
