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

  it('defaults to scene mode with null scene ids', () => {
    const { hook } = setup()
    expect(hook.result.current.room).toEqual({
      mode: 'scene',
      activeSceneId: null,
      combatSceneId: null,
    })
  })

  // ── setMode ─────────────────────────────────────────────────

  it('switches to combat mode', () => {
    const { hook } = setup()

    act(() => hook.result.current.setMode('combat'))

    expect(hook.result.current.room.mode).toBe('combat')
  })

  it('sets combatSceneId from activeSceneId when entering combat without one', () => {
    const { hook } = setup()
    act(() => hook.result.current.setActiveScene('scene-1'))

    act(() => hook.result.current.setMode('combat'))

    expect(hook.result.current.room.combatSceneId).toBe('scene-1')
  })

  // ── enterCombat ─────────────────────────────────────────────

  it('enters combat with explicit sceneId', () => {
    const { hook } = setup()

    act(() => hook.result.current.enterCombat('scene-2'))

    expect(hook.result.current.room.mode).toBe('combat')
    expect(hook.result.current.room.combatSceneId).toBe('scene-2')
  })

  it('enters combat falling back to activeSceneId when no arg and no combatSceneId', () => {
    const { hook } = setup()
    act(() => hook.result.current.setActiveScene('scene-1'))

    act(() => hook.result.current.enterCombat())

    expect(hook.result.current.room.combatSceneId).toBe('scene-1')
  })

  it('enters combat keeping existing combatSceneId when no arg', () => {
    const { hook } = setup()
    act(() => hook.result.current.setCombatScene('scene-3'))

    act(() => hook.result.current.enterCombat())

    expect(hook.result.current.room.combatSceneId).toBe('scene-3')
  })

  // ── exitCombat ──────────────────────────────────────────────

  it('exits combat back to scene mode', () => {
    const { hook } = setup()
    act(() => hook.result.current.enterCombat('scene-1'))

    act(() => hook.result.current.exitCombat())

    expect(hook.result.current.room.mode).toBe('scene')
  })

  // ── setActiveScene / setCombatScene ─────────────────────────

  it('sets active scene', () => {
    const { hook } = setup()

    act(() => hook.result.current.setActiveScene('scene-5'))

    expect(hook.result.current.room.activeSceneId).toBe('scene-5')
  })

  it('sets combat scene', () => {
    const { hook } = setup()

    act(() => hook.result.current.setCombatScene('scene-7'))

    expect(hook.result.current.room.combatSceneId).toBe('scene-7')
  })

  // ── external Yjs change syncs to hook ───────────────────────

  it('syncs when yRoom is mutated externally', () => {
    const { hook, yRoom } = setup()

    act(() => {
      yRoom.set('mode', 'combat')
      yRoom.set('activeSceneId', 'ext-scene')
    })

    expect(hook.result.current.room.mode).toBe('combat')
    expect(hook.result.current.room.activeSceneId).toBe('ext-scene')
  })
})
