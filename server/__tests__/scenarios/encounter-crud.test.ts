// server/__tests__/scenarios/encounter-crud.test.ts
// Integration test: encounter preset CRUD + activate + save-snapshot + multi-client sync
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestRoom,
  waitForSocketEvent,
  connectSecondClient,
  type TestContext,
} from '../helpers/test-server'
import type { Socket as ClientSocket } from 'socket.io-client'

let ctx: TestContext
let clientB: ClientSocket
let sceneId: string

beforeAll(async () => {
  ctx = await setupTestRoom('Encounter CRUD')
  clientB = await connectSecondClient(ctx.apiBase, ctx.roomId)

  // Setup: create a scene
  const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    id: 'enc-scene',
    name: 'Dungeon',
    atmosphere: {},
  })
  sceneId = (data as { id: string }).id
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
})

afterAll(async () => {
  clientB.disconnect()
  await ctx.cleanup()
})

describe('Encounter CRUD Journey', () => {
  let enc1Id: string
  let enc2Id: string

  // ── Create ──

  it('1.1 creates an encounter and broadcasts to other clients', async () => {
    const eventPromise = waitForSocketEvent<{ id: string; name: string; sceneId: string }>(
      clientB,
      'encounter:created',
    )

    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`,
      { name: 'Boss Battle' },
    )
    expect(status).toBe(201)
    const enc = data as { id: string; name: string; sceneId: string }
    expect(enc.id).toBeTruthy()
    expect(enc.name).toBe('Boss Battle')
    expect(enc.sceneId).toBe(sceneId)
    enc1Id = enc.id

    // Verify broadcast
    const broadcast = await eventPromise
    expect(broadcast.id).toBe(enc1Id)
    expect(broadcast.name).toBe('Boss Battle')
  })

  it('1.2 creates a second encounter', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`,
      { name: 'Ambush' },
    )
    expect(status).toBe(201)
    enc2Id = (data as { id: string }).id
  })

  it('1.3 lists encounters for scene', async () => {
    const { status, data } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`,
    )
    expect(status).toBe(200)
    const list = data as { id: string; name: string }[]
    expect(list).toHaveLength(2)
    const names = list.map((e) => e.name)
    expect(names).toContain('Boss Battle')
    expect(names).toContain('Ambush')
  })

  // ── Update ──

  it('2.1 renames encounter and broadcasts', async () => {
    const eventPromise = waitForSocketEvent<{ id: string; name: string }>(
      clientB,
      'encounter:updated',
    )

    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/encounters/${enc1Id}`,
      { name: 'Final Boss' },
    )
    expect(status).toBe(200)
    expect((data as { name: string }).name).toBe('Final Boss')

    const broadcast = await eventPromise
    expect(broadcast.id).toBe(enc1Id)
    expect(broadcast.name).toBe('Final Boss')
  })

  it('2.2 updates encounter map settings', async () => {
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/encounters/${enc1Id}`,
      {
        mapUrl: '/maps/boss-room.jpg',
        mapWidth: 2000,
        mapHeight: 1500,
      },
    )
    expect(status).toBe(200)
    const enc = data as { mapUrl: string; mapWidth: number; mapHeight: number }
    expect(enc.mapUrl).toBe('/maps/boss-room.jpg')
    expect(enc.mapWidth).toBe(2000)
    expect(enc.mapHeight).toBe(1500)
  })

  it('2.3 updates encounter tokens', async () => {
    const tokens = {
      t1: { id: 't1', entityId: null, x: 100, y: 200, size: 1, color: '#ef4444', name: 'Goblin' },
    }
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/encounters/${enc1Id}`,
      { tokens },
    )
    expect(status).toBe(200)
    const enc = data as { tokens: Record<string, unknown> }
    expect(enc.tokens).toHaveProperty('t1')
  })

  // ── Verify persistence ──

  it('2.4 GET reflects all updates', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`)
    const list = data as {
      id: string
      name: string
      mapUrl: string | null
      tokens: Record<string, unknown>
    }[]
    const boss = list.find((e) => e.id === enc1Id)
    expect(boss).toBeDefined()
    expect((boss as (typeof list)[0]).name).toBe('Final Boss')
    expect((boss as (typeof list)[0]).mapUrl).toBe('/maps/boss-room.jpg')
    expect((boss as (typeof list)[0]).tokens).toHaveProperty('t1')
  })

  // ── Activate ──

  it('3.1 activates encounter — populates combat state', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/encounters/${enc1Id}/activate`,
    )
    expect(status).toBe(200)

    // Verify room state updated
    const { data: state } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect((state as { activeEncounterId: string }).activeEncounterId).toBe(enc1Id)

    // Verify combat state has encounter's map
    const { data: combat } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const c = combat as {
      mapUrl: string
      mapWidth: number
      mapHeight: number
      tokens: Record<string, unknown>
    }
    expect(c.mapUrl).toBe('/maps/boss-room.jpg')
    expect(c.mapWidth).toBe(2000)
    expect(c.mapHeight).toBe(1500)
    expect(c.tokens).toHaveProperty('t1')
  })

  // ── Save snapshot ──

  it('3.2 modifies combat state then saves snapshot back to encounter', async () => {
    // Add a token to current combat
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/combat/tokens`, {
      entityId: null,
      x: 500,
      y: 600,
      size: 2,
      name: 'Dragon',
      color: '#9b59b6',
      permissions: { default: 'observer', seats: {} },
    })

    // Save snapshot
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/encounters/${enc1Id}/save-snapshot`,
    )
    expect(status).toBe(200)

    // Verify encounter now has the new token
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`)
    const list = data as { id: string; tokens: Record<string, unknown> }[]
    const boss = list.find((e) => e.id === enc1Id) as (typeof list)[0]
    expect(boss).toBeDefined()
    const tokenKeys = Object.keys(boss.tokens)
    expect(tokenKeys.length).toBeGreaterThanOrEqual(2) // t1 + Dragon
  })

  // ── Delete ──

  it('4.1 deletes encounter and broadcasts', async () => {
    const eventPromise = waitForSocketEvent<{ id: string }>(clientB, 'encounter:deleted')

    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/encounters/${enc2Id}`)
    expect(status).toBe(200)

    const broadcast = await eventPromise
    expect(broadcast.id).toBe(enc2Id)
  })

  it('4.2 deleted encounter no longer in list', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`)
    const list = data as { id: string }[]
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(enc1Id)
  })

  it('4.3 deleting non-existent encounter is idempotent (200)', async () => {
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/encounters/does-not-exist`)
    // Server treats DELETE as idempotent — no error for missing resources
    expect(status).toBe(200)
  })

  // ── Contract checks ──

  it('5.1 encounter response uses camelCase', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`)
    const enc = (data as Record<string, unknown>[])[0]
    // camelCase fields present
    expect(enc).toHaveProperty('id')
    expect(enc).toHaveProperty('sceneId')
    expect(enc).toHaveProperty('name')
    expect(enc).toHaveProperty('mapUrl')
    expect(enc).toHaveProperty('mapWidth')
    expect(enc).toHaveProperty('mapHeight')
    expect(enc).toHaveProperty('grid')
    expect(enc).toHaveProperty('tokens')
    expect(enc).toHaveProperty('gmOnly')
    // No snake_case leak
    expect(enc).not.toHaveProperty('scene_id')
    expect(enc).not.toHaveProperty('map_url')
    expect(enc).not.toHaveProperty('map_width')
    expect(enc).not.toHaveProperty('map_height')
    expect(enc).not.toHaveProperty('gm_only')
  })

  // ── Scene cascade ──

  it('6.1 encounters deleted when scene is deleted', async () => {
    // Create a temporary scene with an encounter
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      id: 'tmp-scene',
      name: 'Temp',
      atmosphere: {},
    })
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/tmp-scene/encounters`, {
      name: 'Temp Encounter',
    })

    // Delete the scene
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/tmp-scene`)

    // Encounters for deleted scene should be empty
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/tmp-scene/encounters`)
    expect(data).toEqual([])
  })
})
