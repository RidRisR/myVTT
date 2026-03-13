import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as Y from 'yjs'
import { useWorldStore } from '../worldStore'

describe('activateEncounter clears stale combat keys', () => {
  let cleanup: (() => void) | undefined

  beforeEach(() => {
    useWorldStore.setState(useWorldStore.getInitialState())
  })

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  function setupScene(yDoc: Y.Doc) {
    const scenes = yDoc.getMap('scenes') as Y.Map<Y.Map<unknown>>
    yDoc.transact(() => {
      const sceneMap = new Y.Map<unknown>()
      scenes.set('scene-1', sceneMap)
      sceneMap.set('name', 'Test Scene')
      sceneMap.set('atmosphere', {
        imageUrl: '',
        width: 1920,
        height: 1080,
        particlePreset: 'none',
        ambientPreset: '',
        ambientAudioUrl: '',
        ambientAudioVolume: 0.5,
      })
      sceneMap.set('sortOrder', 0)
      sceneMap.set('entityIds', new Y.Map())
      sceneMap.set('encounters', new Y.Map())
    })
  }

  it('removes stale keys when activating a new encounter', () => {
    const yDoc = new Y.Doc()
    setupScene(yDoc)

    // Simulate stale combat state from a previous encounter
    const combat = yDoc.getMap('combat')
    combat.set('staleLegacyKey', 'garbage')
    combat.set('anotherOldKey', { data: 'old' })

    // Initialize worldStore
    cleanup = useWorldStore.getState().init(yDoc)

    // Activate a fresh encounter
    useWorldStore.getState().activateEncounter('scene-1')

    // Stale keys should be gone
    expect(combat.get('staleLegacyKey')).toBeUndefined()
    expect(combat.get('anotherOldKey')).toBeUndefined()

    // Expected combat keys should be present
    expect(combat.get('mapUrl')).toBeDefined()
    expect(combat.get('mapWidth')).toBeDefined()
    expect(combat.get('grid')).toBeDefined()
    expect(combat.get('tokens')).toBeInstanceOf(Y.Map)
  })

  it('preserves only expected keys after activation', () => {
    const yDoc = new Y.Doc()
    setupScene(yDoc)
    cleanup = useWorldStore.getState().init(yDoc)

    useWorldStore.getState().activateEncounter('scene-1')

    const combat = yDoc.getMap('combat')
    const keys: string[] = []
    combat.forEach((_v, k) => keys.push(k))

    const expectedKeys = [
      'mapUrl',
      'mapWidth',
      'mapHeight',
      'grid',
      'initiativeOrder',
      'initiativeIndex',
      'tokens',
    ]
    expect(keys.sort()).toEqual(expectedKeys.sort())
  })
})
