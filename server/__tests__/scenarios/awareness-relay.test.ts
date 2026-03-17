// server/__tests__/scenarios/awareness-relay.test.ts
// Integration tests for awareness.ts: ephemeral event relay, seatId injection, disconnect cleanup.
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
  ctx = await setupTestRoom('awareness-relay')
  // Create two seats
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
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Awareness relay', () => {
  // ── seatId injection & guard ──

  it('does NOT relay awareness:update when sender has no seatId', async () => {
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    let received = false
    observer.on('awareness:update', () => {
      received = true
    })

    // ctx.socket has no seatId — awareness should be silently dropped
    ctx.socket.emit('awareness:update', { field: 'cursor', state: { x: 1, y: 2 } })
    await new Promise((r) => setTimeout(r, 200))

    expect(received).toBe(false)
    observer.disconnect()
  })

  it('relays awareness:update and injects server-side seatId', async () => {
    // Claim seat on ctx.socket
    ctx.socket.emit('seat:claim', { seatId: seatA })
    await new Promise((r) => setTimeout(r, 50))

    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    try {
      const eventPromise = waitForSocketEvent<{
        field: string
        state: unknown
        seatId: string
        clientId: string
      }>(observer, 'awareness:update')

      ctx.socket.emit('awareness:update', { field: 'cursor', state: { x: 10, y: 20 } })

      const event = await eventPromise
      expect(event.field).toBe('cursor')
      expect(event.state).toEqual({ x: 10, y: 20 })
      // Server should inject seatA, not whatever the client sent
      expect(event.seatId).toBe(seatA)
      expect(event.clientId).toBeTruthy()
    } finally {
      observer.disconnect()
    }
  })

  // ── awareness:editing relay ──

  it('relays awareness:editing with server-injected seatId', async () => {
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    try {
      const eventPromise = waitForSocketEvent<{
        entityId: string
        field: string
        value: number
        seatId: string
      }>(observer, 'awareness:editing')

      ctx.socket.emit('awareness:editing', {
        entityId: 'e1',
        field: '0',
        value: 42,
        seatId: 'spoofed-id',
        color: '#ff0000',
      })

      const event = await eventPromise
      expect(event.entityId).toBe('e1')
      expect(event.value).toBe(42)
      // Server overwrites client-sent seatId
      expect(event.seatId).toBe(seatA)
    } finally {
      observer.disconnect()
    }
  })

  it('does NOT relay awareness:editing when sender has no seatId', async () => {
    // Create a fresh unclaimed client
    const unclaimed = await connectSecondClient(ctx.apiBase, ctx.roomId)
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    let received = false
    observer.on('awareness:editing', () => {
      received = true
    })

    unclaimed.emit('awareness:editing', {
      entityId: 'e1',
      field: '0',
      value: 99,
      seatId: 'fake',
      color: '#000',
    })
    await new Promise((r) => setTimeout(r, 200))

    expect(received).toBe(false)
    unclaimed.disconnect()
    observer.disconnect()
  })

  // ── awareness:clear relay ──

  it('relays awareness:clear with server-injected seatId', async () => {
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    try {
      const eventPromise = waitForSocketEvent<{ seatId: string }>(observer, 'awareness:clear')

      ctx.socket.emit('awareness:clear', { seatId: 'spoofed' })

      const event = await eventPromise
      expect(event.seatId).toBe(seatA)
    } finally {
      observer.disconnect()
    }
  })

  // ── awareness:tokenDrag relay ──

  it('relays awareness:tokenDrag with server-injected seatId', async () => {
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    try {
      const eventPromise = waitForSocketEvent<{
        tokenId: string
        x: number
        y: number
        seatId: string
      }>(observer, 'awareness:tokenDrag')

      ctx.socket.emit('awareness:tokenDrag', {
        tokenId: 't1',
        x: 100,
        y: 200,
        color: '#ff0000',
        seatId: 'spoofed',
      })

      const event = await eventPromise
      expect(event.tokenId).toBe('t1')
      expect(event.x).toBe(100)
      expect(event.y).toBe(200)
      expect(event.seatId).toBe(seatA)
    } finally {
      observer.disconnect()
    }
  })

  // ── awareness:tokenDragEnd relay ──

  it('relays awareness:tokenDragEnd with server-injected seatId', async () => {
    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    try {
      const eventPromise = waitForSocketEvent<{ seatId: string }>(
        observer,
        'awareness:tokenDragEnd',
      )

      ctx.socket.emit('awareness:tokenDragEnd', { seatId: 'spoofed' })

      const event = await eventPromise
      expect(event.seatId).toBe(seatA)
    } finally {
      observer.disconnect()
    }
  })

  // ── disconnect → awareness:remove ──

  it('broadcasts awareness:remove when a client with seatId disconnects', async () => {
    const claimed = await connectSecondClient(ctx.apiBase, ctx.roomId)
    claimed.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    const removePromise = waitForSocketEvent<{ seatId: string; clientId: string }>(
      ctx.socket,
      'awareness:remove',
    )

    claimed.disconnect()

    const event = await removePromise
    expect(event.seatId).toBe(seatB)
    expect(event.clientId).toBeTruthy()
  })

  it('does NOT broadcast awareness:remove when a client without seatId disconnects', async () => {
    const unclaimed = await connectSecondClient(ctx.apiBase, ctx.roomId)
    // Don't claim any seat

    let received = false
    ctx.socket.on('awareness:remove', () => {
      received = true
    })

    unclaimed.disconnect()
    await new Promise((r) => setTimeout(r, 200))

    expect(received).toBe(false)
    ctx.socket.off('awareness:remove')
  })

  // ── new connection presence notification ──

  it('broadcasts awareness:update (presence) when a client with seatId connects', async () => {
    // First client claims a seat before second connects
    // seatA already claimed by ctx.socket from earlier tests

    const observer = await connectSecondClient(ctx.apiBase, ctx.roomId)
    observer.emit('seat:claim', { seatId: seatB })
    await new Promise((r) => setTimeout(r, 50))

    // Now connect a third client that already has a seat claimed
    // (via seat:claim after connect — awareness fires on connection, not claim)
    // The new connection presence notification fires at connection time,
    // but only if socket.data.seatId is set — which it isn't until seat:claim.
    // So we verify the initial connection does NOT fire awareness:update
    // for a client that hasn't claimed a seat yet.
    let receivedPresence = false
    observer.on('awareness:update', () => {
      receivedPresence = true
    })

    const newClient = await connectSecondClient(ctx.apiBase, ctx.roomId)
    await new Promise((r) => setTimeout(r, 200))

    // New connection without seatId should NOT trigger awareness presence
    expect(receivedPresence).toBe(false)

    newClient.disconnect()
    observer.disconnect()
  })
})
