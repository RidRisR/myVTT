// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestRoom,
  connectSecondClient,
  waitForSocketEvent,
  type TestContext,
} from '../helpers/test-server'

let ctx: TestContext
let sceneId: string

beforeAll(async () => {
  ctx = await setupTestRoom('tactical-broadcast-test')

  // Setup: scene + active scene
  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Broadcast Arena',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Tactical broadcast tests', () => {
  it('PATCH /tactical broadcasts tactical:updated', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    const eventPromise = waitForSocketEvent<{ mapUrl: string }>(socket2, 'tactical:updated')

    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      mapUrl: '/maps/broadcast-test.jpg',
    })

    const payload = await eventPromise
    expect(payload.mapUrl).toBe('/maps/broadcast-test.jpg')

    socket2.disconnect()
  })

  it('POST /tactical/tokens broadcasts tactical:token:added', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Create entity first
    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Broadcast Fighter',
      lifecycle: 'reusable',
      color: '#ef4444',
    })
    const entityId = (entity as { id: string }).id

    const eventPromise = waitForSocketEvent<{ id: string; entityId: string }>(
      socket2,
      'tactical:token:added',
    )

    const { data: token } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`,
      { entityId, x: 5, y: 10 },
    )
    const tokenData = token as { id: string; entityId: string }

    const payload = await eventPromise
    expect(payload.entityId).toBe(entityId)
    expect(payload.id).toBe(tokenData.id)

    socket2.disconnect()
  })

  it('POST /tactical/tokens/quick broadcasts both tactical:token:added and entity:created', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    const tokenPromise = waitForSocketEvent<{ id: string; entityId: string }>(
      socket2,
      'tactical:token:added',
    )
    const entityPromise = waitForSocketEvent<{ id: string; name: string }>(
      socket2,
      'entity:created',
    )

    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/quick`, {
      x: 15,
      y: 25,
      name: 'Quick Goblin',
      color: '#22c55e',
    })
    const result = data as { entity: { id: string }; token: { id: string } }

    const [tokenPayload, entityPayload] = await Promise.all([tokenPromise, entityPromise])

    expect(tokenPayload.id).toBe(result.token.id)
    expect(tokenPayload.entityId).toBe(result.entity.id)
    expect(entityPayload.id).toBe(result.entity.id)
    expect(entityPayload.name).toBe('Quick Goblin')

    socket2.disconnect()
  })

  it('PATCH /tactical/tokens/:id broadcasts tactical:token:updated', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Create a token to update
    const { data: quickResult } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
      { x: 0, y: 0, name: 'Movable' },
    )
    const movableTokenId = (quickResult as { token: { id: string } }).token.id

    const eventPromise = waitForSocketEvent<{ id: string; x: number; y: number }>(
      socket2,
      'tactical:token:updated',
    )

    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical/tokens/${movableTokenId}`, {
      x: 42,
      y: 84,
    })

    const payload = await eventPromise
    expect(payload.id).toBe(movableTokenId)
    expect(payload.x).toBe(42)
    expect(payload.y).toBe(84)

    socket2.disconnect()
  })

  it('DELETE /tactical/tokens/:id broadcasts tactical:token:removed', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Create a token to delete
    const { data: quickResult } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
      { x: 0, y: 0, name: 'Doomed' },
    )
    const doomedTokenId = (quickResult as { token: { id: string } }).token.id

    const eventPromise = waitForSocketEvent<{ id: string }>(socket2, 'tactical:token:removed')

    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/tactical/tokens/${doomedTokenId}`)

    const payload = await eventPromise
    expect(payload.id).toBe(doomedTokenId)

    socket2.disconnect()
  })

  it('POST /tactical/enter broadcasts tactical:updated with tacticalMode=1', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Ensure we are exited first
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/exit`)

    const eventPromise = waitForSocketEvent<{ tacticalMode: number }>(socket2, 'tactical:updated')

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)

    const payload = await eventPromise
    expect(payload.tacticalMode).toBe(1)

    socket2.disconnect()
  })

  it('POST /tactical/enter broadcasts tactical:updated with full state including tokens', async () => {
    // Regression: tactical:updated on enter must include the full tactical state
    // (including tokens array) so the client store can populate tacticalInfo.
    // Previously this was a separate tactical:activated event; now consolidated.
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Ensure we are exited first
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/exit`)

    const eventPromise = waitForSocketEvent<{ tokens: unknown[]; tacticalMode: number }>(
      socket2,
      'tactical:updated',
    )

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)

    const payload = await eventPromise
    expect(payload.tacticalMode).toBe(1)
    expect(Array.isArray(payload.tokens)).toBe(true)

    socket2.disconnect()
  })

  it('POST /tactical/exit broadcasts tactical:updated with tacticalMode=0', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Ensure we are entered first
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)

    const eventPromise = waitForSocketEvent<{ tacticalMode: number }>(socket2, 'tactical:updated')

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/exit`)

    const payload = await eventPromise
    expect(payload.tacticalMode).toBe(0)

    socket2.disconnect()
  })
})
