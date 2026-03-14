// server/__tests__/scenarios/combat-lifecycle.test.ts
// Integration test: complete combat lifecycle — highest-bug-density area
// Tests run sequentially — each depends on prior state.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('Combat Lifecycle')
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Combat Lifecycle Journey', () => {
  let entity1Id: string
  let entity2Id: string
  let token1Id: string
  let token2Id: string

  // Setup: create scene + 2 entities
  it('setup: create scene and entities', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      id: 'combat-sc',
      name: 'Arena',
      atmosphere: {},
    })
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: 'combat-sc' })

    const { data: e1 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Fighter',
      persistent: false,
      color: '#ef4444',
      size: 1,
      permissions: { default: 'observer', seats: {} },
    })
    entity1Id = (e1 as { id: string }).id
    const { data: e2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Mage',
      persistent: false,
      color: '#3b82f6',
      size: 1,
      permissions: { default: 'observer', seats: {} },
    })
    entity2Id = (e2 as { id: string }).id
  })

  it('2.1 starts combat', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/combat/start`)
    expect(status).toBe(200)

    const { data: state } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    const roomState = state as { activeEncounterId: string }
    expect(roomState.activeEncounterId).toBeTruthy()
    expect(roomState.activeEncounterId).toMatch(/^adhoc-/)
  })

  it('2.2 combat state has complete grid defaults', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const combat = data as { grid: Record<string, unknown> }
    expect(combat.grid).toBeDefined()
    expect(combat.grid.size).toBe(50)
    expect(combat.grid.snap).toBe(true)
    expect(combat.grid.visible).toBe(true)
    expect(typeof combat.grid.color).toBe('string')
    expect(combat.grid.offsetX).toBe(0)
    expect(combat.grid.offsetY).toBe(0)
  })

  it('2.3 sets combat map', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/combat`, {
      mapUrl: '/map.jpg',
      mapWidth: 2000,
      mapHeight: 1500,
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const combat = data as { mapUrl: string; mapWidth: number; mapHeight: number }
    expect(combat.mapUrl).toBe('/map.jpg')
    expect(combat.mapWidth).toBe(2000)
    expect(combat.mapHeight).toBe(1500)
  })

  it('2.4 adds token 1', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/combat/tokens`, {
      entityId: entity1Id,
      x: 100,
      y: 200,
      size: 1,
      permissions: { default: 'observer', seats: {} },
    })
    expect(status).toBe(201)
    const token = data as { id: string }
    expect(token.id).toBeTruthy()
    token1Id = token.id
  })

  it('2.5 adds token 2', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/combat/tokens`, {
      entityId: entity2Id,
      x: 300,
      y: 400,
      size: 2,
      permissions: { default: 'observer', seats: {} },
    })
    token2Id = (data as { id: string }).id

    const { data: combat } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const tokens = (combat as { tokens: Record<string, unknown> }).tokens
    expect(Object.keys(tokens)).toHaveLength(2)
  })

  it('2.6 moves token', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/combat/tokens/${token1Id}`, {
      x: 150,
      y: 250,
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const tokens = (data as { tokens: Record<string, { x: number; y: number }> }).tokens
    expect(tokens[token1Id].x).toBe(150)
    expect(tokens[token1Id].y).toBe(250)
    // token2 unchanged
    expect(tokens[token2Id].x).toBe(300)
  })

  it('2.7 updates grid with partial merge', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/combat`, {
      grid: { size: 70, visible: false },
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const grid = (data as { grid: Record<string, unknown> }).grid
    expect(grid.size).toBe(70)
    expect(grid.visible).toBe(false)
    expect(grid.snap).toBe(true) // Preserved from default
  })

  it('2.8 sets initiative order', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/combat`, {
      initiativeOrder: [token2Id, token1Id],
      initiativeIndex: 0,
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const combat = data as { initiativeOrder: string[]; initiativeIndex: number }
    expect(combat.initiativeOrder).toEqual([token2Id, token1Id])
    expect(combat.initiativeIndex).toBe(0)
  })

  it('2.9 deletes token', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/combat/tokens/${token1Id}`)
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const tokens = (data as { tokens: Record<string, unknown> }).tokens
    expect(tokens[token1Id]).toBeUndefined()
    expect(tokens[token2Id]).toBeDefined()
  })

  it('2.10 ends combat — deactivates but preserves state', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/combat/end`)

    const { data: state } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect((state as { activeEncounterId: string | null }).activeEncounterId).toBeNull()
  })

  it('2.11 combat data preserved after end', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const combat = data as { mapUrl: string; tokens: Record<string, unknown> }
    expect(combat.mapUrl).toBe('/map.jpg')
    expect(Object.keys(combat.tokens)).toHaveLength(1)
    expect(combat.tokens[token2Id]).toBeDefined()
  })

  it('2.12 re-enters combat — state still intact', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/combat/start`)
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const combat = data as { mapUrl: string; tokens: Record<string, unknown> }
    expect(combat.mapUrl).toBe('/map.jpg')
    expect(Object.keys(combat.tokens)).toHaveLength(1)
  })

  it('2.13 scene not affected by combat lifecycle', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect((data as { activeSceneId: string }).activeSceneId).toBe('combat-sc')
  })

  // Contract checks
  it('2.14 combat response has correct contract shape', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const combat = data as Record<string, unknown>
    // All camelCase
    expect(combat).toHaveProperty('mapUrl')
    expect(combat).toHaveProperty('mapWidth')
    expect(combat).toHaveProperty('mapHeight')
    expect(combat).toHaveProperty('grid')
    expect(combat).toHaveProperty('tokens')
    expect(combat).toHaveProperty('initiativeOrder')
    expect(combat).toHaveProperty('initiativeIndex')
    // No snake_case
    expect(combat).not.toHaveProperty('map_url')
    expect(combat).not.toHaveProperty('map_width')
  })
})
