import { renderHook, act } from '@testing-library/react'
import * as Y from 'yjs'
import { useRoom } from '../useRoom'

describe('useRoom', () => {
  function setup() {
    const yDoc = new Y.Doc()
    const yRoom = yDoc.getMap('room')
    const hook = renderHook(() => useRoom(yRoom))
    return { yDoc, yRoom, hook }
  }

  // ── initial state ───────────────────────────────────────────

  it('defaults to null activeSceneId', () => {
    const { hook } = setup()
    expect(hook.result.current.room).toEqual({
      activeSceneId: null,
    })
  })

  // ── setActiveScene ─────────────────────────────────────────

  it('sets active scene', () => {
    const { hook } = setup()

    act(() => hook.result.current.setActiveScene('scene-5'))

    expect(hook.result.current.room.activeSceneId).toBe('scene-5')
  })

  // ── external Yjs change syncs to hook ───────────────────────

  it('syncs when yRoom is mutated externally', () => {
    const { hook, yRoom } = setup()

    act(() => {
      yRoom.set('activeSceneId', 'ext-scene')
    })

    expect(hook.result.current.room.activeSceneId).toBe('ext-scene')
  })
})
