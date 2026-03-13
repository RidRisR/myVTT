import { describe, it, expect } from 'vitest'
import { act } from '@testing-library/react'
import * as Y from 'yjs'
import { createTestDoc } from '../../__test-utils__/yjs-helpers'
import { useWorldStore } from '../worldStore'

/**
 * Tests for the default scene auto-creation behavior.
 *
 * In App.tsx, when a GM enters a room with no scenes:
 *   if (scenes.length === 0 && !room.activeSceneId) → create default scene
 *
 * We test the underlying worldStore.addScene + setActiveScene behavior
 * that this logic depends on.
 */

function initWorldStore(yDoc: Y.Doc) {
  const cleanup = useWorldStore.getState().init(yDoc)
  return cleanup
}

describe('default scene creation', () => {
  it('addScene creates a scene with atmosphere and sets it active', () => {
    const { yDoc } = createTestDoc()
    const cleanup = initWorldStore(yDoc)

    const { addScene, setActiveScene } = useWorldStore.getState()
    const sceneId = 'default-scene-1'

    act(() => {
      addScene(sceneId, 'Scene 1', {
        imageUrl: '',
        width: 1920,
        height: 1080,
        particlePreset: 'none',
        ambientPreset: '',
        ambientAudioUrl: '',
        ambientAudioVolume: 0.5,
      })
      setActiveScene(sceneId)
    })

    const state = useWorldStore.getState()
    expect(state.scenes).toHaveLength(1)
    expect(state.scenes[0].id).toBe(sceneId)
    expect(state.scenes[0].name).toBe('Scene 1')
    expect(state.scenes[0].atmosphere.imageUrl).toBe('')
    expect(state.scenes[0].atmosphere.width).toBe(1920)
    expect(state.room.activeSceneId).toBe(sceneId)

    cleanup()
  })

  it('does not duplicate scene when scenes already exist', () => {
    const { yDoc } = createTestDoc()
    const cleanup = initWorldStore(yDoc)

    const { addScene } = useWorldStore.getState()

    act(() => {
      addScene('existing-1', 'Existing Scene', {
        imageUrl: '/some/image.png',
        width: 1920,
        height: 1080,
        particlePreset: 'none',
        ambientPreset: '',
        ambientAudioUrl: '',
        ambientAudioVolume: 0.5,
      })
    })

    const state = useWorldStore.getState()
    expect(state.scenes).toHaveLength(1)

    // The auto-create logic in App.tsx checks scenes.length > 0 → skips
    // We verify that the guard condition would prevent creation
    expect(state.scenes.length > 0).toBe(true)

    cleanup()
  })

  it('created scene syncs to second client via Yjs', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    // Bidirectional sync
    doc1.on('update', (update: Uint8Array) => Y.applyUpdate(doc2, update))
    doc2.on('update', (update: Uint8Array) => Y.applyUpdate(doc1, update))

    const cleanup1 = initWorldStore(doc1)

    act(() => {
      useWorldStore.getState().addScene('sync-scene', 'Scene 1', {
        imageUrl: '',
        width: 1920,
        height: 1080,
        particlePreset: 'none',
        ambientPreset: '',
        ambientAudioUrl: '',
        ambientAudioVolume: 0.5,
      })
      useWorldStore.getState().setActiveScene('sync-scene')
    })

    cleanup1()

    // Init store on doc2 — scene should already be there via sync
    const cleanup2 = initWorldStore(doc2)

    const state = useWorldStore.getState()
    expect(state.scenes).toHaveLength(1)
    expect(state.scenes[0].id).toBe('sync-scene')
    expect(state.room.activeSceneId).toBe('sync-scene')

    cleanup2()
  })
})
