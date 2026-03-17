// server/__tests__/scenarios/room-presence.test.ts
// Integration test: admin:snapshot and room:presence socket events deliver onlineColors
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'
import {
  setupTestRoom,
  connectSecondClient,
  waitForSocketEvent,
  type TestContext,
} from '../helpers/test-server'

let ctx: TestContext
let secondClient: ClientSocket | undefined

/** Connect an admin socket (no roomId query — admin connection path) */
async function connectAdminClient(apiBase: string): Promise<ClientSocket> {
  const socket = ioClient(apiBase, {
    transports: ['websocket'],
    forceNew: true,
    // No query.roomId — triggers admin connection path in ws.ts
  })
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => { resolve(); })
    socket.on('connect_error', reject)
    setTimeout(() => { reject(new Error('Admin socket connect timeout')); }, 5000)
  })
  return socket
}

beforeAll(async () => {
  ctx = await setupTestRoom('presence-test')
})
afterAll(async () => {
  secondClient?.disconnect()
  await ctx.cleanup()
})

describe('Room Presence via Socket', () => {
  it('GET /api/rooms no longer returns onlineColors', async () => {
    const { data } = await ctx.api('GET', '/api/rooms')
    const rooms = data as { id: string; onlineColors?: string[] }[]
    const room = rooms.find((r) => r.id === ctx.roomId)
    expect(room).toBeTruthy()
    expect(room!.onlineColors).toBeUndefined()
  })

  it('admin:snapshot returns empty onlineColors when no seat is claimed', async () => {
    const admin = await connectAdminClient(ctx.apiBase)
    try {
      const snapshotPromise = waitForSocketEvent<{ id: string; onlineColors: string[] }[]>(
        admin,
        'admin:snapshot',
      )
      admin.emit('join:admin')
      const snapshot = await snapshotPromise
      const room = snapshot.find((r) => r.id === ctx.roomId)
      expect(room).toBeTruthy()
      expect(room!.onlineColors).toEqual([])
    } finally {
      admin.disconnect()
    }
  })

  it('room:presence fires with seat color after client claims a seat', async () => {
    const { data: seatData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
      name: 'GM',
      role: 'GM',
      color: '#ff6600',
    })
    const seatId = (seatData as { id: string }).id

    const admin = await connectAdminClient(ctx.apiBase)
    const snapshotPromise = waitForSocketEvent(admin, 'admin:snapshot')
    admin.emit('join:admin')
    await snapshotPromise

    const presencePromise = waitForSocketEvent<{ roomId: string; onlineColors: string[] }>(
      admin,
      'room:presence',
    )
    ctx.socket.emit('seat:claim', { seatId })
    const presence = await presencePromise

    expect(presence.roomId).toBe(ctx.roomId)
    expect(presence.onlineColors).toEqual(['#ff6600'])
    admin.disconnect()
  })

  it('room:presence returns multiple colors when multiple clients are connected', async () => {
    const { data: seat2Data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
      name: 'Player',
      role: 'PL',
      color: '#3b82f6',
    })
    const seat2Id = (seat2Data as { id: string }).id

    const admin = await connectAdminClient(ctx.apiBase)
    const snapshotPromise = waitForSocketEvent(admin, 'admin:snapshot')
    admin.emit('join:admin')
    await snapshotPromise

    secondClient = await connectSecondClient(ctx.apiBase, ctx.roomId)
    const presencePromise = waitForSocketEvent<{ roomId: string; onlineColors: string[] }>(
      admin,
      'room:presence',
    )
    secondClient.emit('seat:claim', { seatId: seat2Id })
    const presence = await presencePromise

    expect(presence.onlineColors).toHaveLength(2)
    expect(presence.onlineColors).toContain('#ff6600')
    expect(presence.onlineColors).toContain('#3b82f6')
    admin.disconnect()
  })

  it('room:presence deduplicates colors when same seat has multiple connections', async () => {
    const admin = await connectAdminClient(ctx.apiBase)
    const snapshotPromise = waitForSocketEvent(admin, 'admin:snapshot')
    admin.emit('join:admin')
    await snapshotPromise

    const { data: seats } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/seats`)
    const gmSeat = (seats as { id: string; role: string }[]).find((s) => s.role === 'GM')
    const thirdClient = await connectSecondClient(ctx.apiBase, ctx.roomId)

    const presencePromise = waitForSocketEvent<{ roomId: string; onlineColors: string[] }>(
      admin,
      'room:presence',
    )
    thirdClient.emit('seat:claim', { seatId: gmSeat!.id })
    const presence = await presencePromise

    // Should still be 2 unique colors, not 3
    expect(presence.onlineColors).toHaveLength(2)

    thirdClient.disconnect()
    admin.disconnect()
  })
})

describe('Room list and deletion events', () => {
  it('room:created fires when a new room is created', async () => {
    const admin = await connectAdminClient(ctx.apiBase)
    const snapshotPromise = waitForSocketEvent(admin, 'admin:snapshot')
    admin.emit('join:admin')
    await snapshotPromise

    const createdPromise = waitForSocketEvent<{ id: string; name: string }>(admin, 'room:created')
    await ctx.api('POST', '/api/rooms', { name: 'new-room-event-test' })
    const created = await createdPromise

    expect(created.name).toBe('new-room-event-test')
    expect(created.id).toBeTruthy()

    admin.disconnect()
  })

  it('room:deleted fires when a room is deleted', async () => {
    const { data: newRoom } = await ctx.api('POST', '/api/rooms', { name: 'to-be-deleted' })
    const newRoomId = (newRoom as { id: string }).id

    const admin = await connectAdminClient(ctx.apiBase)
    const snapshotPromise = waitForSocketEvent(admin, 'admin:snapshot')
    admin.emit('join:admin')
    await snapshotPromise

    const deletedPromise = waitForSocketEvent<{ id: string }>(admin, 'room:deleted')
    await ctx.api('DELETE', `/api/rooms/${newRoomId}`)
    const deleted = await deletedPromise

    expect(deleted.id).toBe(newRoomId)

    admin.disconnect()
  })
})

describe('room:presence on disconnect and color change', () => {
  it('room:presence fires with empty colors when the only player disconnects', async () => {
    const freshCtx = await setupTestRoom('disconnect-test')
    const { data: seatData } = await freshCtx.api('POST', `/api/rooms/${freshCtx.roomId}/seats`, {
      name: 'GM',
      role: 'GM',
      color: '#aabbcc',
    })
    const seatId = (seatData as { id: string }).id
    freshCtx.socket.emit('seat:claim', { seatId })
    await waitForSocketEvent(freshCtx.socket, 'seat:online')

    const admin = await connectAdminClient(freshCtx.apiBase)
    const snapshotPromise = waitForSocketEvent(admin, 'admin:snapshot')
    admin.emit('join:admin')
    await snapshotPromise

    const presencePromise = waitForSocketEvent<{ roomId: string; onlineColors: string[] }>(
      admin,
      'room:presence',
    )
    freshCtx.socket.disconnect()
    const presence = await presencePromise

    expect(presence.roomId).toBe(freshCtx.roomId)
    expect(presence.onlineColors).toEqual([])

    admin.disconnect()
    await freshCtx.cleanup()
  })

  it('room:presence fires with updated color when seat color is changed via PATCH', async () => {
    const freshCtx = await setupTestRoom('color-patch-test')
    const { data: seatData } = await freshCtx.api('POST', `/api/rooms/${freshCtx.roomId}/seats`, {
      name: 'Player',
      role: 'PL',
      color: '#111111',
    })
    const seatId = (seatData as { id: string }).id
    freshCtx.socket.emit('seat:claim', { seatId })
    await waitForSocketEvent(freshCtx.socket, 'seat:online')

    const admin = await connectAdminClient(freshCtx.apiBase)
    const snapshotPromise = waitForSocketEvent(admin, 'admin:snapshot')
    admin.emit('join:admin')
    await snapshotPromise

    const presencePromise = waitForSocketEvent<{ roomId: string; onlineColors: string[] }>(
      admin,
      'room:presence',
    )
    await freshCtx.api('PATCH', `/api/rooms/${freshCtx.roomId}/seats/${seatId}`, {
      color: '#ffffff',
    })
    const presence = await presencePromise

    expect(presence.roomId).toBe(freshCtx.roomId)
    expect(presence.onlineColors).toContain('#ffffff')
    expect(presence.onlineColors).not.toContain('#111111')

    admin.disconnect()
    await freshCtx.cleanup()
  })
})
