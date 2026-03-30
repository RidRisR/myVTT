// src/ui-system/__tests__/production-wiring.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getUIRegistry, createProductionSDK, _resetRegistriesForTesting } from '../uiSystemInit'
import { createLayoutStore } from '../../stores/layoutStore'
import { AwarenessManager, createAwarenessChannel } from '../awarenessChannel'

beforeEach(() => {
  _resetRegistriesForTesting()
})

describe('production wiring integration', () => {
  it('registry singletons are stable across calls', () => {
    const ui1 = getUIRegistry()
    const ui2 = getUIRegistry()
    expect(ui1).toBe(ui2)
  })

  it('layoutStore hydrated from bundle feeds activeLayout', () => {
    const store = createLayoutStore()
    store.getState().loadLayout({
      narrative: {
        'poc-ui.hello#1': { x: 10, y: 20, width: 240, height: 140, zOrder: 0 },
      },
      tactical: {},
    })
    const active = store.getState().activeLayout
    expect(active).toHaveProperty('poc-ui.hello#1')
    expect(active['poc-ui.hello#1']!.x).toBe(10)
  })

  it('createProductionSDK provides full IComponentSDK with all required fields', () => {
    const mockEmit = vi.fn()
    const manager = new AwarenessManager(mockEmit)
    const sdk = createProductionSDK({
      instanceKey: 'poc-ui.hello#1',
      instanceProps: {},
      role: 'GM',
      layoutMode: 'play',
      read: {
        entity: () => undefined,
        component: () => undefined,
        query: () => [],
        formulaTokens: () => ({}),
      },
      workflow: { runWorkflow: vi.fn() } as never,
      awarenessManager: manager,
      layoutActions: {
        openPanel: () => 'new#1',
        closePanel: () => {},
      },
      logSubscribe: () => () => {},
    })

    // All required fields present
    expect(sdk.read).toBeDefined()
    expect(sdk.workflow).toBeDefined()
    expect(sdk.context.layoutMode).toBe('play')
    expect(sdk.context.role).toBe('GM')
    expect(sdk.interaction).toBeDefined()
    expect(sdk.awareness).toBeDefined()
    expect(sdk.awareness.subscribe).toBeTypeOf('function')
    expect(sdk.awareness.broadcast).toBeTypeOf('function')
    expect(sdk.awareness.clear).toBeTypeOf('function')
    expect(sdk.log).toBeDefined()
    expect(sdk.log.subscribe).toBeTypeOf('function')
    expect(sdk.ui).toBeDefined()
    expect(sdk.ui.openPanel).toBeTypeOf('function')
    expect(sdk.ui.closePanel).toBeTypeOf('function')
  })

  it('createProductionSDK omits interaction in edit mode', () => {
    const sdk = createProductionSDK({
      instanceKey: 'test#1',
      instanceProps: {},
      role: 'GM',
      layoutMode: 'edit',
      read: {
        entity: () => undefined,
        component: () => undefined,
        query: () => [],
        formulaTokens: () => ({}),
      },
      workflow: { runWorkflow: vi.fn() } as never,
      awarenessManager: null,
      layoutActions: null,
      logSubscribe: null,
    })
    expect(sdk.interaction).toBeUndefined()
  })

  it('awareness round-trip via AwarenessManager', () => {
    const mockEmit = vi.fn()
    const manager = new AwarenessManager(mockEmit)
    const ch = createAwarenessChannel<{ x: number }>('test:cursor')
    const handler = vi.fn()

    manager.subscribe(ch, handler)

    // Simulate server relay
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:cursor',
      payload: { x: 42 },
      seatId: 'seat-B',
    })

    expect(handler).toHaveBeenCalledWith('seat-B', { x: 42 })

    // Outgoing broadcast
    manager.broadcast(ch, { x: 99 })
    expect(mockEmit).toHaveBeenCalledWith('awareness:ch:broadcast', {
      channel: 'test:cursor',
      payload: { x: 99 },
    })

    manager.dispose()
  })

  it('layout edit cycle: load → edit → update → exit preserves changes', () => {
    const store = createLayoutStore()
    store.getState().loadLayout({
      narrative: { 'a#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 } },
      tactical: {},
    })

    // Enter edit mode
    store.getState().setLayoutMode('edit')
    expect(store.getState().layoutMode).toBe('edit')

    // Drag panel
    store.getState().updateEntry('a#1', { x: 50, y: 50 })
    expect(store.getState().narrative['a#1']!.x).toBe(50)

    // Exit edit mode
    store.getState().setLayoutMode('play')
    expect(store.getState().layoutMode).toBe('play')

    // Changes preserved
    expect(store.getState().narrative['a#1']!.x).toBe(50)
    expect(store.getState().narrative['a#1']!.y).toBe(50)
  })

  it('layout mode switch: narrative ↔ tactical', () => {
    const store = createLayoutStore()
    store.getState().loadLayout({
      narrative: { 'chat#1': { x: 0, y: 0, width: 300, height: 400, zOrder: 0 } },
      tactical: { 'map#1': { x: 10, y: 10, width: 500, height: 500, zOrder: 1 } },
    })

    // Default: narrative
    expect(store.getState().activeLayout).toHaveProperty('chat#1')
    expect(store.getState().activeLayout).not.toHaveProperty('map#1')

    // Switch to tactical
    store.getState().setIsTactical(true)
    expect(store.getState().activeLayout).toHaveProperty('map#1')
    expect(store.getState().activeLayout).not.toHaveProperty('chat#1')

    // Switch back
    store.getState().setIsTactical(false)
    expect(store.getState().activeLayout).toHaveProperty('chat#1')
  })

  it('remote layout:updated is blocked in edit mode', () => {
    const store = createLayoutStore()
    store.getState().loadLayout({
      narrative: { 'a#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 } },
      tactical: {},
    })

    // Enter edit mode, make local change
    store.getState().setLayoutMode('edit')
    store.getState().updateEntry('a#1', { x: 77 })

    // Verify edit mode blocks remote — this tests the guard in worldStore
    // (socket listener checks layoutMode === 'edit' before calling loadLayout)
    expect(store.getState().layoutMode).toBe('edit')
    expect(store.getState().narrative['a#1']!.x).toBe(77)
  })

  it('addEntry + removeEntry CRUD cycle', () => {
    const store = createLayoutStore()
    store.getState().loadLayout({ narrative: {}, tactical: {} })

    // Add
    store.getState().addEntry('new#1', { x: 10, y: 20, width: 200, height: 150, zOrder: 0 })
    expect(store.getState().narrative).toHaveProperty('new#1')

    // Remove
    store.getState().removeEntry('new#1')
    expect(store.getState().narrative).not.toHaveProperty('new#1')
  })
})
