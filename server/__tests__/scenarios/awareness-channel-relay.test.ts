// server/__tests__/scenarios/awareness-channel-relay.test.ts
// Integration tests for awareness:ch:broadcast and awareness:ch:clear relay in awareness.ts.
// Uses the real setupAwareness production code path via the shared test server infrastructure.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestRoom,
  connectSecondClient,
  waitForSocketEvent,
  type TestContext,
} from '../helpers/test-server'

let ctx: TestContext
let seatA: string
let seatB: string

beforeAll(async () => {
  ctx = await setupTestRoom('awareness-channel-relay')
  const { data: a } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
    name: 'GM',
    role: 'GM',
    color: '#ff0000',
  })
  seatA = (a as { id: string }).id
  const { data: b } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
    name: 'Player',
    role: 'PL',
    color: '#00ff00',
  })
  seatB = (b as { id: string }).id

  // Claim seatA on the primary socket so it has a seatId
  ctx.socket.emit('seat:claim', { seatId: seatA })
  await new Promise((r) => setTimeout(r, 50))
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('awareness channel relay', () => {
  it('relays awareness:ch:broadcast to room with server-injected seatId', async () => {
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    try {
      const eventPromise = waitForSocketEvent<{
        channel: string
        payload: unknown
        seatId: string
      }>(observer, 'awareness:ch:broadcast')

      ctx.socket.emit('awareness:ch:broadcast', {
        channel: 'dh:spell.targeting',
        payload: { tokenIds: ['t1'] },
      })

      const event = await eventPromise
      expect(event.channel).toBe('dh:spell.targeting')
      expect(event.payload).toEqual({ tokenIds: ['t1'] })
      // Server injects seatId from socket.data — client cannot spoof it
      expect(event.seatId).toBe(seatA)
    } finally {
      observer.disconnect()
    }
  })

  it('does not relay awareness:ch:broadcast when sender has no seatId', async () => {
    const unclaimed = await connectSecondClient(ctx.apiBase, ctx.roomId)
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    let received = false
    observer.on('awareness:ch:broadcast', () => {
      received = true
    })

    // unclaimed has no seatId — server should silently drop the message
    unclaimed.emit('awareness:ch:broadcast', {
      channel: 'test:ch',
      payload: {},
    })
    await new Promise((r) => setTimeout(r, 200))

    expect(received).toBe(false)
    unclaimed.disconnect()
    observer.disconnect()
  })

  it('drops awareness:ch:broadcast when payload exceeds 4KB limit', async () => {
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    let received = false
    observer.on('awareness:ch:broadcast', () => {
      received = true
    })

    // Payload that serializes to > 4096 bytes
    const oversized = { data: 'x'.repeat(5000) }
    ctx.socket.emit('awareness:ch:broadcast', {
      channel: 'test:oversized',
      payload: oversized,
    })
    await new Promise((r) => setTimeout(r, 200))

    expect(received).toBe(false)
    observer.disconnect()
  })

  it('relays awareness:ch:clear to room with server-injected seatId', async () => {
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    try {
      const eventPromise = waitForSocketEvent<{ channel: string; seatId: string }>(
        observer,
        'awareness:ch:clear',
      )

      ctx.socket.emit('awareness:ch:clear', { channel: 'dh:spell.targeting' })

      const event = await eventPromise
      expect(event.channel).toBe('dh:spell.targeting')
      expect(event.seatId).toBe(seatA)
    } finally {
      observer.disconnect()
    }
  })

  it('does not relay awareness:ch:clear when sender has no seatId', async () => {
    const unclaimed = await connectSecondClient(ctx.apiBase, ctx.roomId)
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    let received = false
    observer.on('awareness:ch:clear', () => {
      received = true
    })

    unclaimed.emit('awareness:ch:clear', { channel: 'test:ch' })
    await new Promise((r) => setTimeout(r, 200))

    expect(received).toBe(false)
    unclaimed.disconnect()
    observer.disconnect()
  })
})
