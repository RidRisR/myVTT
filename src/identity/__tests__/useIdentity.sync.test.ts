import { renderHook, act } from '@testing-library/react'
import { useIdentity } from '../useIdentity'
import { createSyncedPair } from '../../__test-utils__/yjs-helpers'

describe('useIdentity — multi-client sync', () => {
  function setup() {
    const { doc1, doc2, world1, world2 } = createSyncedPair()
    const hook1 = renderHook(() => useIdentity(world1.seats, null))
    const hook2 = renderHook(() => useIdentity(world2.seats, null))
    return { doc1, doc2, world1, world2, hook1, hook2 }
  }

  it('Client A creates seat → Client B sees it', () => {
    const { hook1, hook2 } = setup()

    act(() => hook1.result.current.createSeat('Alice', 'GM'))

    expect(hook2.result.current.seats).toHaveLength(1)
    expect(hook2.result.current.seats[0].name).toBe('Alice')
    expect(hook2.result.current.seats[0].role).toBe('GM')
  })

  it('both clients create seats → both see both', () => {
    const { hook1, hook2 } = setup()

    act(() => hook1.result.current.createSeat('Alice', 'GM'))
    act(() => hook2.result.current.createSeat('Bob', 'PL'))

    expect(hook1.result.current.seats).toHaveLength(2)
    expect(hook2.result.current.seats).toHaveLength(2)

    const names1 = hook1.result.current.seats.map((s) => s.name).sort()
    const names2 = hook2.result.current.seats.map((s) => s.name).sort()
    expect(names1).toEqual(['Alice', 'Bob'])
    expect(names2).toEqual(['Alice', 'Bob'])
  })

  it('Client A deletes seat → Client B sees removal', () => {
    const { hook1, hook2 } = setup()

    act(() => hook1.result.current.createSeat('Alice', 'GM'))
    const seatId = hook1.result.current.seats[0].id

    act(() => hook1.result.current.deleteSeat(seatId))

    expect(hook1.result.current.seats).toHaveLength(0)
    expect(hook2.result.current.seats).toHaveLength(0)
  })

  it('Client A updates seat name → Client B sees update', () => {
    const { hook1, hook2 } = setup()

    act(() => hook1.result.current.createSeat('Alice', 'GM'))
    const seatId = hook1.result.current.seats[0].id

    act(() => hook1.result.current.updateSeat(seatId, { name: 'Alice (GM)' }))

    expect(hook2.result.current.seats[0].name).toBe('Alice (GM)')
  })
})
