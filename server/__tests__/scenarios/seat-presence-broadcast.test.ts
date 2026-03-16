// server/__tests__/scenarios/seat-presence-broadcast.test.ts
// Integration test: seat:online / seat:offline broadcasts and initial sync
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestRoom,
  connectSecondClient,
  waitForSocketEvent,
  type TestContext,
} from '../helpers/test-server'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'

let ctx: TestContext
let seatId: string

beforeAll(async () => {
  ctx = await setupTestRoom('presence-broadcast')
  // Create a seat for testing
  const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
    name: 'GM',
    role: 'GM',
    color: '#ff6600',
  })
  seatId = (data as { id: string }).id
})
afterAll(async () => {
  await ctx.cleanup()
})

/**
 * Connect a client with a listener registered BEFORE the connection completes.
 * This prevents missing the initial seat:online sync that fires during connection.
 */
function connectWithEarlyListener(
  apiBase: string,
  roomId: string,
  event: string,
): { socket: ClientSocket; eventPromise: Promise<{ seatId: string }> } {
  const socket = ioClient(apiBase, {
    transports: ['websocket'],
    forceNew: true,
    autoConnect: false,
    query: { roomId },
  })
  const eventPromise = waitForSocketEvent<{ seatId: string }>(socket, event)
  socket.connect()
  return { socket, eventPromise }
}

describe('Seat presence broadcasting', () => {
  it('broadcasts seat:online to other clients when a seat is claimed', async () => {
    const secondClient = await connectSecondClient(ctx.apiBase, ctx.roomId)
    try {
      // Set up listener BEFORE the claim happens
      const onlinePromise = waitForSocketEvent<{ seatId: string }>(secondClient, 'seat:online')

      ctx.socket.emit('seat:claim', { seatId })

      const event = await onlinePromise
      expect(event.seatId).toBe(seatId)
    } finally {
      secondClient.disconnect()
    }
  })

  it('broadcasts seat:offline when a client leaves a seat', async () => {
    // First, claim the seat
    ctx.socket.emit('seat:claim', { seatId })
    await new Promise((r) => setTimeout(r, 50))

    // Connect observer with early listener to catch initial seat:online sync
    const { socket: observer, eventPromise: initialOnline } = connectWithEarlyListener(
      ctx.apiBase,
      ctx.roomId,
      'seat:online',
    )
    try {
      await initialOnline

      // Now listen for seat:offline
      const offlinePromise = waitForSocketEvent<{ seatId: string }>(observer, 'seat:offline')
      ctx.socket.emit('seat:leave', { seatId })

      const event = await offlinePromise
      expect(event.seatId).toBe(seatId)
    } finally {
      observer.disconnect()
    }
  })

  it('broadcasts seat:offline when a client disconnects', async () => {
    // Connect a second client and have it claim the seat
    const claimingClient = await connectSecondClient(ctx.apiBase, ctx.roomId)
    claimingClient.emit('seat:claim', { seatId })
    await new Promise((r) => setTimeout(r, 50))

    // Connect observer with early listener to catch initial seat:online sync
    const { socket: observer, eventPromise: initialOnline } = connectWithEarlyListener(
      ctx.apiBase,
      ctx.roomId,
      'seat:online',
    )
    try {
      await initialOnline

      // Listen for seat:offline
      const offlinePromise = waitForSocketEvent<{ seatId: string }>(observer, 'seat:offline')

      // Disconnect the claiming client
      claimingClient.disconnect()

      const event = await offlinePromise
      expect(event.seatId).toBe(seatId)
    } finally {
      observer.disconnect()
    }
  })

  it('does NOT broadcast seat:offline if another connection still holds the seat', async () => {
    // Both ctx.socket and secondClient claim the same seat
    ctx.socket.emit('seat:claim', { seatId })
    await new Promise((r) => setTimeout(r, 50))

    const secondClient = await connectSecondClient(ctx.apiBase, ctx.roomId)
    secondClient.emit('seat:claim', { seatId })
    await new Promise((r) => setTimeout(r, 50))

    // Connect observer with early listener
    const { socket: observer, eventPromise: initialOnline } = connectWithEarlyListener(
      ctx.apiBase,
      ctx.roomId,
      'seat:online',
    )
    try {
      await initialOnline

      // Disconnect secondClient — ctx.socket still holds the seat
      let receivedOffline = false
      observer.on('seat:offline', () => {
        receivedOffline = true
      })
      secondClient.disconnect()

      // Wait long enough to be confident seat:offline would have arrived
      await new Promise((r) => setTimeout(r, 300))
      expect(receivedOffline).toBe(false)
    } finally {
      observer.disconnect()
    }
  })

  it('sends initial online seats to a newly connecting client', async () => {
    // Ensure seat is claimed
    ctx.socket.emit('seat:claim', { seatId })
    await new Promise((r) => setTimeout(r, 50))

    // Connect with early listener to catch initial seat:online sync
    const { socket: newClient, eventPromise: onlinePromise } = connectWithEarlyListener(
      ctx.apiBase,
      ctx.roomId,
      'seat:online',
    )
    try {
      const event = await onlinePromise
      expect(event.seatId).toBe(seatId)
    } finally {
      newClient.disconnect()
    }
  })
})
