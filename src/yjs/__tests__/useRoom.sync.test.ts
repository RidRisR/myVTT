import { renderHook, act } from '@testing-library/react'
import { useRoom } from '../useRoom'
import { createSyncedPair } from '../../__test-utils__/yjs-helpers'

describe('useRoom — multi-client sync', () => {
  function setup() {
    const { doc1, doc2, world1, world2 } = createSyncedPair()
    const hook1 = renderHook(() => useRoom(world1.room))
    const hook2 = renderHook(() => useRoom(world2.room))
    return { doc1, doc2, world1, world2, hook1, hook2 }
  }

  it('Client A sets activeSceneId → Client B sees it', () => {
    const { hook1, hook2 } = setup()

    act(() => hook1.result.current.setActiveScene('scene-1'))

    expect(hook2.result.current.room.activeSceneId).toBe('scene-1')
  })
})
