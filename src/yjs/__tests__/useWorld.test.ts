import * as Y from 'yjs'
import { createWorldMaps } from '../useWorld'

describe('createWorldMaps — multi-client safety', () => {
  it('both clients share the same seats data via top-level getMap', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    // Simulate bidirectional sync
    doc1.on('update', (update: Uint8Array) => Y.applyUpdate(doc2, update))
    doc2.on('update', (update: Uint8Array) => Y.applyUpdate(doc1, update))

    const world1 = createWorldMaps(doc1)
    const world2 = createWorldMaps(doc2)

    // Client 1 writes a seat
    world1.seats.set('seat-1', { id: 'seat-1', name: 'GM' })

    // Client 2 should see it
    expect(world2.seats.get('seat-1')).toEqual({ id: 'seat-1', name: 'GM' })

    // Client 2 writes a seat
    world2.seats.set('seat-2', { id: 'seat-2', name: 'Player' })

    // Client 1 should see it
    expect(world1.seats.get('seat-2')).toEqual({ id: 'seat-2', name: 'Player' })

    // Both see both seats
    expect(world1.seats.size).toBe(2)
    expect(world2.seats.size).toBe(2)
  })

  it('both clients share the same room data', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    doc1.on('update', (update: Uint8Array) => Y.applyUpdate(doc2, update))
    doc2.on('update', (update: Uint8Array) => Y.applyUpdate(doc1, update))

    const world1 = createWorldMaps(doc1)
    const world2 = createWorldMaps(doc2)

    world1.room.set('mode', 'combat')
    expect(world2.room.get('mode')).toBe('combat')

    world2.room.set('activeSceneId', 'scene-1')
    expect(world1.room.get('activeSceneId')).toBe('scene-1')
  })

  it('late-joining client sees existing data after sync', () => {
    const doc1 = new Y.Doc()
    const world1 = createWorldMaps(doc1)

    // Client 1 creates data before client 2 connects
    world1.seats.set('seat-1', { id: 'seat-1', name: 'GM' })
    world1.room.set('mode', 'scene')

    // Client 2 joins later — apply full state
    const doc2 = new Y.Doc()
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

    const world2 = createWorldMaps(doc2)

    expect(world2.seats.get('seat-1')).toEqual({ id: 'seat-1', name: 'GM' })
    expect(world2.room.get('mode')).toBe('scene')
  })

  it('nested ensureSubMap pattern causes orphaned references (regression guard)', () => {
    // This test demonstrates WHY the old ensureSubMap pattern was broken.
    // Two clients creating nested Y.Maps for the same key before sync
    // results in one client holding an orphaned reference.
    const doc1 = new Y.Doc({ gc: false })
    const doc2 = new Y.Doc({ gc: false })

    // NO live sync — simulate pre-sync state
    const world1 = doc1.getMap('world')
    const world2 = doc2.getMap('world')

    // Both clients create their own seats map (old ensureSubMap behavior)
    const seats1 = new Y.Map()
    doc1.transact(() => world1.set('seats', seats1))

    const seats2 = new Y.Map()
    doc2.transact(() => world2.set('seats', seats2))

    // Client 1 writes to its seats map
    seats1.set('seat-1', { id: 'seat-1', name: 'GM' })

    // Now sync: apply doc1 state to doc2 and vice versa
    const update1 = Y.encodeStateAsUpdate(doc1)
    const update2 = Y.encodeStateAsUpdate(doc2)
    Y.applyUpdate(doc2, update1)
    Y.applyUpdate(doc1, update2)

    // After conflict resolution, one map wins.
    // The losing client's reference is now orphaned.
    // At least one client's local reference no longer matches the resolved value.
    const resolved1 = world1.get('seats')
    const resolved2 = world2.get('seats')

    // Both world maps agree on the winner
    expect(resolved1).toBeInstanceOf(Y.Map)
    expect(resolved2).toBeInstanceOf(Y.Map)

    // But at least one client's original reference is orphaned
    const seats1Orphaned = seats1 !== resolved1
    const seats2Orphaned = seats2 !== resolved2
    expect(seats1Orphaned || seats2Orphaned).toBe(true)
  })
})
