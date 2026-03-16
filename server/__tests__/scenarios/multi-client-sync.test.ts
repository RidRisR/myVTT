// server/__tests__/scenarios/multi-client-sync.test.ts
// Integration test: Socket.io broadcast — when Client A makes REST calls,
// Client B receives the correct events.
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

beforeAll(async () => {
  ctx = await setupTestRoom('sync-test')
  clientB = await connectSecondClient(ctx.apiBase, ctx.roomId)
})
afterAll(async () => {
  clientB.disconnect()
  await ctx.cleanup()
})

describe('Multi-Client Sync Journey', () => {
  let sceneId: string
  let entityId: string
  let showcaseId: string

  // ── Scene events ──

  it('5.1 scene:created broadcasts to client B', async () => {
    const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'scene:created')
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Cave',
      atmosphere: {},
    })
    expect(status).toBe(201)
    sceneId = (data as { id: string }).id

    const payload = await eventPromise
    expect(payload.name).toBe('Cave')
    expect(payload.id).toBe(sceneId)
  })

  it('5.2 scene:updated broadcasts to client B', async () => {
    const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'scene:updated')
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/scenes/${sceneId}`, {
      name: 'Dark Cave',
    })

    const payload = await eventPromise
    expect(payload.name).toBe('Dark Cave')
    expect(payload.id).toBe(sceneId)
  })

  it('5.3 scene:deleted broadcasts to client B', async () => {
    // Create a throwaway scene to delete
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Temp Scene',
      atmosphere: {},
    })
    const tempId = (data as { id: string }).id

    const eventPromise = waitForSocketEvent<{ id: string }>(clientB, 'scene:deleted')
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${tempId}`)

    const payload = await eventPromise
    expect(payload.id).toBe(tempId)
  })

  // ── Entity events ──

  it('5.4 entity:created broadcasts to client B', async () => {
    const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'entity:created')
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Goblin',
      color: '#22c55e',
      width: 1,
      height: 1,
      lifecycle: 'ephemeral',
    })
    expect(status).toBe(201)
    entityId = (data as { id: string }).id

    const payload = await eventPromise
    expect(payload.name).toBe('Goblin')
    expect(payload.id).toBe(entityId)
  })

  // ── Tactical events ──

  it('5.5 tactical:updated broadcasts on POST /tactical/enter', async () => {
    // Set active scene first
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })

    const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'tactical:updated')
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)

    const payload = await eventPromise
    expect(payload.tacticalMode).toBe(1)
  })

  it('5.6 tactical:token:added broadcasts on POST /tactical/tokens', async () => {
    const eventPromise = waitForSocketEvent<Record<string, unknown>>(
      clientB,
      'tactical:token:added',
    )
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens`, {
      entityId,
      x: 100,
      y: 200,
      width: 1,
      height: 1,
    })
    expect(status).toBe(201)

    const payload = await eventPromise
    expect(payload.entityId).toBe(entityId)
    expect(payload.x).toBe(100)
    expect(payload.y).toBe(200)
  })

  it('5.7 tactical:updated broadcasts on POST /tactical/exit', async () => {
    const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'tactical:updated')
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/exit`)

    const payload = await eventPromise
    expect(payload.tacticalMode).toBe(0)
  })

  // ── Chat events ──

  it('5.8 chat:new broadcasts on POST /chat', async () => {
    const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'chat:new')
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/chat`, {
      senderId: 'gm-1',
      senderName: 'GM',
      senderColor: '#ff0000',
      content: 'Roll initiative!',
    })

    const payload = await eventPromise
    expect(payload.content).toBe('Roll initiative!')
    expect(payload.senderName).toBe('GM')
    expect(payload.type).toBe('text')
    expect(payload.id).toBeTruthy()
  })

  // ── Room state events ──

  it('5.9 room:state:updated broadcasts on PATCH /state', async () => {
    const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'room:state:updated')
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, {
      activeSceneId: sceneId,
    })

    const payload = await eventPromise
    expect(payload.activeSceneId).toBe(sceneId)
  })

  // ── Showcase events ──

  it('5.10 showcase:created broadcasts on POST /showcase', async () => {
    const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'showcase:created')
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/showcase`, {
      type: 'image',
      data: { imageUrl: 'loot.jpg', title: 'Magic Sword' },
    })
    expect(status).toBe(201)
    showcaseId = (data as { id: string }).id

    const payload = await eventPromise
    expect(payload.id).toBe(showcaseId)
    expect(payload.type).toBe('image')
  })

  it('5.11 showcase:cleared broadcasts on DELETE /showcase', async () => {
    const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'showcase:cleared')
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/showcase`)

    const payload = await eventPromise
    expect(payload).toBeDefined()
  })

  // ── Verify both clients receive the same event (no echo suppression) ──

  it('5.12 client A (ctx.socket) also receives broadcasts', async () => {
    const eventPromise = waitForSocketEvent<Record<string, unknown>>(ctx.socket, 'scene:created')
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Echo Test',
      atmosphere: {},
    })

    const payload = await eventPromise
    expect(payload.name).toBe('Echo Test')
  })
})
