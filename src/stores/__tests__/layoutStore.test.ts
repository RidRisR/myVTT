import { describe, it, expect, beforeEach } from 'vitest'
import { createLayoutStore, type LayoutStoreState } from '../layoutStore'
import type { StoreApi } from 'zustand'
import type { RegionLayoutConfig } from '../../ui-system/regionTypes'

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
    const narrative = {
      'chat#1': {
        anchor: 'top-left' as const,
        offsetX: 0,
        offsetY: 0,
        width: 300,
        height: 400,
        zOrder: 0,
      },
    }
    const tactical = {
      'map#1': {
        anchor: 'top-left' as const,
        offsetX: 10,
        offsetY: 10,
        width: 500,
        height: 500,
        zOrder: 1,
      },
    }
    store.getState().loadLayout({ narrative, tactical })
    expect(store.getState().narrative).toEqual(narrative)
    expect(store.getState().tactical).toEqual(tactical)
  })

  it('updateEntry updates a single entry in the active mode', () => {
    store.getState().loadLayout({
      narrative: {
        'a#1': {
          anchor: 'top-left' as const,
          offsetX: 0,
          offsetY: 0,
          width: 100,
          height: 100,
          zOrder: 0,
        },
      },
      tactical: {},
    })
    store.getState().updateEntry('a#1', { offsetX: 50, offsetY: 50 })
    expect(store.getState().narrative['a#1']!.offsetX).toBe(50)
    expect(store.getState().narrative['a#1']!.offsetY).toBe(50)
    expect(store.getState().narrative['a#1']!.width).toBe(100)
  })

  it('addEntry adds a new panel to the active layout', () => {
    store.getState().addEntry('new#1', {
      anchor: 'top-left' as const,
      offsetX: 0,
      offsetY: 0,
      width: 200,
      height: 150,
      zOrder: 0,
    })
    expect(store.getState().narrative).toHaveProperty('new#1')
  })

  it('removeEntry removes a panel from the active layout', () => {
    store.getState().loadLayout({
      narrative: {
        'a#1': {
          anchor: 'top-left' as const,
          offsetX: 0,
          offsetY: 0,
          width: 100,
          height: 100,
          zOrder: 0,
        },
      },
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
      narrative: {
        'a#1': {
          anchor: 'top-left' as const,
          offsetX: 0,
          offsetY: 0,
          width: 100,
          height: 100,
          zOrder: 0,
        },
      },
      tactical: {
        'b#1': {
          anchor: 'top-left' as const,
          offsetX: 10,
          offsetY: 10,
          width: 200,
          height: 200,
          zOrder: 0,
        },
      },
    })
    expect(store.getState().activeLayout).toEqual(store.getState().narrative)
    store.getState().setIsTactical(true)
    expect(store.getState().activeLayout).toEqual(store.getState().tactical)
  })

  it('loadLayout auto-migrates legacy {x,y} entries', () => {
    store.getState().loadLayout({
      narrative: {
        'test#1': { x: 100, y: 100, width: 200, height: 100, zOrder: 0 },
      } as unknown as RegionLayoutConfig,
      tactical: {},
    })
    const entry = store.getState().narrative['test#1']!
    expect(entry.anchor).toBeDefined()
    expect('x' in entry).toBe(false)
  })

  it('openOnDemand adds instance with incrementing zOrder', () => {
    store.getState().openOnDemand('test:detail', 'test:detail#a1', { spellId: 'fireball' })
    expect(store.getState().onDemandInstances).toHaveLength(1)
    expect(store.getState().onDemandInstances[0]!.zOrder).toBe(1)
  })

  it('closeOnDemand removes instance', () => {
    store.getState().openOnDemand('test:detail', 'test:detail#a1', {})
    store.getState().closeOnDemand('test:detail#a1')
    expect(store.getState().onDemandInstances).toHaveLength(0)
  })

  it('bringToFront updates instance zOrder', () => {
    store.getState().openOnDemand('test:detail', '#a1', {})
    store.getState().openOnDemand('test:detail', '#a2', {})
    store.getState().bringToFront('#a1')
    const a1 = store.getState().onDemandInstances.find((i) => i.instanceKey === '#a1')
    const a2 = store.getState().onDemandInstances.find((i) => i.instanceKey === '#a2')
    expect(a1!.zOrder).toBeGreaterThan(a2!.zOrder)
  })

  describe('resizeOrigin compensation', () => {
    it('adjusts offsetY when resizing with center-left origin', () => {
      store.getState().addEntry('card', {
        anchor: 'top-left',
        offsetX: 8,
        offsetY: 70,
        width: 44,
        height: 44,
        zOrder: 0,
        resizeOrigin: 'center-left',
      })
      store.getState().updateEntry('card', { width: 220, height: 340 })
      const entry = store.getState().narrative['card']!
      expect(entry.width).toBe(220)
      expect(entry.height).toBe(340)
      expect(entry.offsetX).toBe(8) // unchanged (left edge fixed)
      expect(entry.offsetY).toBe(70 - 148) // (0-0.5)*(340-44) = -148
    })

    it('no compensation without resizeOrigin', () => {
      store.getState().addEntry('plain', {
        anchor: 'top-left',
        offsetX: 8,
        offsetY: 70,
        width: 44,
        height: 44,
        zOrder: 0,
      })
      store.getState().updateEntry('plain', { width: 220, height: 340 })
      const entry = store.getState().narrative['plain']!
      expect(entry.offsetX).toBe(8)
      expect(entry.offsetY).toBe(70)
    })

    it('round-trips: expand then collapse restores original offsets', () => {
      store.getState().addEntry('rt', {
        anchor: 'top-left',
        offsetX: 10,
        offsetY: 50,
        width: 44,
        height: 44,
        zOrder: 0,
        resizeOrigin: 'center-left',
      })
      store.getState().updateEntry('rt', { width: 220, height: 340 })
      store.getState().updateEntry('rt', { width: 44, height: 44 })
      const entry = store.getState().narrative['rt']!
      expect(entry.offsetX).toBe(10)
      expect(entry.offsetY).toBe(50)
    })

    it('compensates both axes with center origin', () => {
      store.getState().addEntry('center', {
        anchor: 'top-left',
        offsetX: 100,
        offsetY: 100,
        width: 100,
        height: 100,
        zOrder: 0,
        resizeOrigin: 'center',
      })
      store.getState().updateEntry('center', { width: 200, height: 300 })
      const entry = store.getState().narrative['center']!
      // dOffsetX = (0-0.5)*100 = -50, dOffsetY = (0-0.5)*200 = -100
      expect(entry.offsetX).toBe(50)
      expect(entry.offsetY).toBe(0)
    })
  })
})
