import { renderHook, act } from '@testing-library/react'
import { useSceneTokens } from '../useSceneTokens'
import { createSyncedPair, addSceneToDoc } from '../../__test-utils__/yjs-helpers'
import { makeToken } from '../../__test-utils__/fixtures'

describe('useSceneTokens — multi-client sync', () => {
  const sceneId = 'scene-1'

  function setup() {
    const { doc1, doc2, world1, world2 } = createSyncedPair()
    // Create scene on doc1 (auto-syncs to doc2)
    addSceneToDoc(world1.scenes, doc1, sceneId)
    const hook1 = renderHook(() => useSceneTokens(world1, sceneId))
    const hook2 = renderHook(() => useSceneTokens(world2, sceneId))
    return { doc1, doc2, world1, world2, hook1, hook2 }
  }

  it('Client A adds token → Client B sees it', () => {
    const { hook1, hook2 } = setup()
    const token = makeToken({ id: 'tok-1', x: 100, y: 200 })

    act(() => hook1.result.current.addToken(token))

    expect(hook2.result.current.tokens).toHaveLength(1)
    expect(hook2.result.current.tokens[0].id).toBe('tok-1')
    expect(hook2.result.current.tokens[0].x).toBe(100)
    expect(hook2.result.current.tokens[0].y).toBe(200)
  })

  it('Client A moves token → Client B sees updated position', () => {
    const { hook1, hook2 } = setup()
    act(() => hook1.result.current.addToken(makeToken({ id: 'tok-1', x: 100, y: 200 })))

    act(() => hook1.result.current.updateToken('tok-1', { x: 300, y: 400 }))

    expect(hook2.result.current.tokens[0].x).toBe(300)
    expect(hook2.result.current.tokens[0].y).toBe(400)
  })

  it('Client A deletes token → Client B syncs', () => {
    const { hook1, hook2 } = setup()
    act(() => hook1.result.current.addToken(makeToken({ id: 'tok-1' })))
    expect(hook2.result.current.tokens).toHaveLength(1)

    act(() => hook1.result.current.deleteToken('tok-1'))

    expect(hook1.result.current.tokens).toHaveLength(0)
    expect(hook2.result.current.tokens).toHaveLength(0)
  })
})
