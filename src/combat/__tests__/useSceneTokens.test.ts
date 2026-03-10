import { renderHook, act } from '@testing-library/react'
import { useSceneTokens } from '../useSceneTokens'
import { createTestDoc, addSceneToDoc } from '../../__test-utils__/yjs-helpers'
import { makeToken } from '../../__test-utils__/fixtures'

describe('useSceneTokens — single client', () => {
  const sceneId = 'scene-1'

  function setup(sid: string | null = sceneId) {
    const { yDoc, ...world } = createTestDoc()
    if (sid) addSceneToDoc(world.scenes, yDoc, sid)
    const hook = renderHook(() => useSceneTokens(world, sid))
    return { yDoc, world, hook }
  }

  // ── null sceneId path ───────────────────────────────────────

  it('returns empty tokens when sceneId is null', () => {
    const { hook } = setup(null)
    expect(hook.result.current.tokens).toEqual([])
  })

  it('addToken is a no-op when sceneId is null', () => {
    const { hook } = setup(null)
    // Should not throw
    act(() => hook.result.current.addToken(makeToken({ id: 'tok-1' })))
    expect(hook.result.current.tokens).toEqual([])
  })

  // ── CRUD ────────────────────────────────────────────────────

  it('adds and reads a token', () => {
    const { hook } = setup()
    const token = makeToken({ id: 'tok-1', x: 50, y: 75 })

    act(() => hook.result.current.addToken(token))

    expect(hook.result.current.tokens).toHaveLength(1)
    expect(hook.result.current.tokens[0].id).toBe('tok-1')
    expect(hook.result.current.tokens[0].x).toBe(50)
  })

  it('updates an existing token', () => {
    const { hook } = setup()
    act(() => hook.result.current.addToken(makeToken({ id: 'tok-1', x: 100, y: 200 })))

    act(() => hook.result.current.updateToken('tok-1', { x: 300 }))

    expect(hook.result.current.tokens[0].x).toBe(300)
    expect(hook.result.current.tokens[0].y).toBe(200) // unchanged
  })

  it('updateToken no-ops for nonexistent token', () => {
    const { hook } = setup()
    // Should not throw
    act(() => hook.result.current.updateToken('nope', { x: 999 }))
    expect(hook.result.current.tokens).toHaveLength(0)
  })

  it('updateToken no-ops when sceneId is null', () => {
    const { hook } = setup(null)
    act(() => hook.result.current.updateToken('tok-1', { x: 999 }))
    expect(hook.result.current.tokens).toEqual([])
  })

  it('deletes a token', () => {
    const { hook } = setup()
    act(() => hook.result.current.addToken(makeToken({ id: 'tok-1' })))
    expect(hook.result.current.tokens).toHaveLength(1)

    act(() => hook.result.current.deleteToken('tok-1'))

    expect(hook.result.current.tokens).toHaveLength(0)
  })

  // ── getToken ──────────────────────────────────────────────

  it('getToken returns a token by id', () => {
    const { hook } = setup()
    act(() => hook.result.current.addToken(makeToken({ id: 'tok-1', x: 42 })))

    expect(hook.result.current.getToken('tok-1')?.x).toBe(42)
  })

  it('getToken returns null for null id', () => {
    const { hook } = setup()
    expect(hook.result.current.getToken(null)).toBeNull()
  })

  it('getToken returns null for nonexistent id', () => {
    const { hook } = setup()
    expect(hook.result.current.getToken('nope')).toBeNull()
  })

  it('getToken returns null when sceneId is null', () => {
    const { hook } = setup(null)
    expect(hook.result.current.getToken('tok-1')).toBeNull()
  })
})
