import { describe, it, expect, beforeEach } from 'vitest'
import { createLayoutStore, type LayoutStoreState } from '../layoutStore'
import type { StoreApi } from 'zustand'

describe('layoutStore', () => {
  let store: StoreApi<LayoutStoreState>

  beforeEach(() => {
    store = createLayoutStore()
  })

  it('initializes with empty layouts and play mode', () => {
    const s = store.getState()
    expect(s.narrative).toEqual({})
    expect(s.tactical).toEqual({})
    expect(s.layoutMode).toBe('play')
  })

  it('loadLayout replaces both configs', () => {
    const narrative = { 'chat#1': { x: 0, y: 0, width: 300, height: 400, zOrder: 0 } }
    const tactical = { 'map#1': { x: 10, y: 10, width: 500, height: 500, zOrder: 1 } }
    store.getState().loadLayout({ narrative, tactical })
    expect(store.getState().narrative).toEqual(narrative)
    expect(store.getState().tactical).toEqual(tactical)
  })

  it('updateEntry updates a single entry in the active mode', () => {
    store.getState().loadLayout({
      narrative: { 'a#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 } },
      tactical: {},
    })
    store.getState().updateEntry('a#1', { x: 50, y: 50 })
    expect(store.getState().narrative['a#1']!.x).toBe(50)
    expect(store.getState().narrative['a#1']!.y).toBe(50)
    expect(store.getState().narrative['a#1']!.width).toBe(100)
  })

  it('addEntry adds a new panel to the active layout', () => {
    store.getState().addEntry('new#1', { x: 0, y: 0, width: 200, height: 150, zOrder: 0 })
    expect(store.getState().narrative).toHaveProperty('new#1')
  })

  it('removeEntry removes a panel from the active layout', () => {
    store.getState().loadLayout({
      narrative: { 'a#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 } },
      tactical: {},
    })
    store.getState().removeEntry('a#1')
    expect(store.getState().narrative).not.toHaveProperty('a#1')
  })

  it('setLayoutMode toggles between play and edit', () => {
    store.getState().setLayoutMode('edit')
    expect(store.getState().layoutMode).toBe('edit')
    store.getState().setLayoutMode('play')
    expect(store.getState().layoutMode).toBe('play')
  })

  it('setIsTactical switches active mode', () => {
    store.getState().loadLayout({
      narrative: { 'a#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 } },
      tactical: { 'b#1': { x: 10, y: 10, width: 200, height: 200, zOrder: 0 } },
    })
    expect(store.getState().activeLayout).toEqual(store.getState().narrative)
    store.getState().setIsTactical(true)
    expect(store.getState().activeLayout).toEqual(store.getState().tactical)
  })
})
