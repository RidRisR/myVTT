// server/__tests__/scenarios/room-presence.test.ts
// Integration test: GET /api/rooms returns onlineColors for connected clients
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, connectSecondClient, type TestContext } from '../helpers/test-server'
import type { Socket as ClientSocket } from 'socket.io-client'

let ctx: TestContext
let secondClient: ClientSocket | undefined

beforeAll(async () => {
  ctx = await setupTestRoom('presence-test')
})
afterAll(async () => {
  secondClient?.disconnect()
  await ctx.cleanup()
})

describe('Room Presence in GET /api/rooms', () => {
  it('returns onlineColors as empty array when no seat is claimed', async () => {
    const { data } = await ctx.api('GET', '/api/rooms')
    const rooms = data as { id: string; onlineColors: string[] }[]
    const room = rooms.find((r) => r.id === ctx.roomId)
    expect(room).toBeTruthy()
    // Socket is connected but no seat claimed yet → no colors
    expect(room!.onlineColors).toEqual([])
  })

  it('returns seat color after client claims a seat', async () => {
    // Create a seat with a known color
    const { data: seatData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
      name: 'GM',
      role: 'GM',
      color: '#ff6600',
    })
    const seatId = (seatData as { id: string }).id

    // Claim the seat on the socket
    ctx.socket.emit('seat:claim', { seatId })
    // Small delay for the server to process
    await new Promise((r) => setTimeout(r, 100))

    const { data } = await ctx.api('GET', '/api/rooms')
    const rooms = data as { id: string; onlineColors: string[] }[]
    const room = rooms.find((r) => r.id === ctx.roomId)
    expect(room!.onlineColors).toEqual(['#ff6600'])
  })

  it('returns multiple colors when multiple clients are connected', async () => {
    // Create a second seat
    const { data: seat2Data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
      name: 'Player',
      role: 'PL',
      color: '#3b82f6',
    })
    const seat2Id = (seat2Data as { id: string }).id

    // Connect second client and claim the second seat
    secondClient = await connectSecondClient(ctx.apiBase, ctx.roomId)
    secondClient.emit('seat:claim', { seatId: seat2Id })
    await new Promise((r) => setTimeout(r, 100))

    const { data } = await ctx.api('GET', '/api/rooms')
    const rooms = data as { id: string; onlineColors: string[] }[]
    const room = rooms.find((r) => r.id === ctx.roomId)
    expect(room!.onlineColors).toHaveLength(2)
    expect(room!.onlineColors).toContain('#ff6600')
    expect(room!.onlineColors).toContain('#3b82f6')
  })

  it('deduplicates colors when same seat has multiple connections', async () => {
    // Connect a third client claiming the same seat as first client
    const thirdClient = await connectSecondClient(ctx.apiBase, ctx.roomId)
    // Claim same GM seat
    const { data: seats } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/seats`)
    const gmSeat = (seats as { id: string; role: string }[]).find((s) => s.role === 'GM')
    thirdClient.emit('seat:claim', { seatId: gmSeat!.id })
    await new Promise((r) => setTimeout(r, 100))

    const { data } = await ctx.api('GET', '/api/rooms')
    const rooms = data as { id: string; onlineColors: string[] }[]
    const room = rooms.find((r) => r.id === ctx.roomId)
    // Should still be 2 unique colors, not 3
    expect(room!.onlineColors).toHaveLength(2)

    thirdClient.disconnect()
  })
})
