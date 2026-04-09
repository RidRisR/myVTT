// @vitest-environment node
// server/__tests__/scenarios/game-log.test.ts
// Integration test: game log Socket.io handlers (log:entry, log:roll-request, log:history)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestRoom,
  connectSecondClient,
  waitForSocketEvent,
  type TestContext,
} from '../helpers/test-server'
import type { GameLogEntry, LogEntryAck, RollRequestAck } from '../../../src/shared/logTypes'
import type { Socket as ClientSocket } from 'socket.io-client'

let ctx: TestContext
let seatId: string
let secondClient: ClientSocket

beforeAll(async () => {
  ctx = await setupTestRoom('game-log-test')

  // Create a GM seat
  const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
    name: 'GM',
    role: 'GM',
    color: '#ff6600',
  })
  seatId = (data as { id: string }).id

  // Claim the seat on the primary socket
  ctx.socket.emit('seat:claim', { seatId })
  await new Promise((r) => setTimeout(r, 100))

  // Connect a second client for broadcast tests
  secondClient = await connectSecondClient(ctx.apiBase, ctx.roomId)
})

afterAll(async () => {
  secondClient.disconnect()
  await ctx.cleanup()
})

// Helper: emit log:entry and get ack as a promise
function emitLogEntry(
  socket: ClientSocket,
  submission: Record<string, unknown>,
): Promise<LogEntryAck> {
  return new Promise((resolve) => {
    socket.emit('log:entry', submission as never, resolve as never)
  })
}

// Helper: emit log:roll-request and get ack as a promise
function emitRollRequest(
  socket: ClientSocket,
  request: Record<string, unknown>,
): Promise<RollRequestAck> {
  return new Promise((resolve) => {
    socket.emit('log:roll-request', request as never, resolve as never)
  })
}

// Helper: emit log:history and get ack as a promise
function emitLogHistory(
  socket: ClientSocket,
  query: { beforeSeq?: number; limit?: number },
): Promise<GameLogEntry[]> {
  return new Promise((resolve) => {
    socket.emit('log:history', query, resolve as never)
  })
}

describe('Game Log Handlers', () => {
  // ── log:entry basic flow ──

  it('log:entry basic flow: ack has seq + executor forced, second client gets broadcast', async () => {
    const broadcastPromise = waitForSocketEvent<GameLogEntry>(secondClient, 'log:new')

    const submission = {
      id: 'test-entry-001',
      type: 'core:text',
      origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
      parentId: undefined,
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      baseSeq: 0,
      payload: { text: 'Hello world' },
      timestamp: Date.now(),
    }

    const ack = await emitLogEntry(ctx.socket, submission)

    // Ack should be a valid GameLogEntry
    expect('error' in ack).toBe(false)
    const entry = ack as GameLogEntry
    expect(entry.seq).toBeGreaterThan(0)
    expect(entry.id).toBe('test-entry-001')
    expect(entry.type).toBe('core:text')
    expect(entry.executor).toBe(seatId)
    expect(entry.payload).toEqual({ text: 'Hello world' })
    expect(entry.chainDepth).toBe(0)
    expect(entry.triggerable).toBe(false)

    // Second client should receive the broadcast
    const broadcast = await broadcastPromise
    expect(broadcast.id).toBe('test-entry-001')
    expect(broadcast.seq).toBe(entry.seq)
    expect(broadcast.executor).toBe(seatId)
  })

  // ── log:entry duplicate ──

  it('log:entry duplicate: same id → same seq, not double processed', async () => {
    const submission = {
      id: 'test-entry-dup',
      type: 'core:text',
      origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      baseSeq: 0,
      payload: { text: 'Original' },
      timestamp: Date.now(),
    }

    // First submission
    const ack1 = await emitLogEntry(ctx.socket, submission)
    expect('error' in ack1).toBe(false)
    const entry1 = ack1 as GameLogEntry

    // Second submission with same id
    const ack2 = await emitLogEntry(ctx.socket, { ...submission, payload: { text: 'Duplicate' } })
    expect('error' in ack2).toBe(false)
    const entry2 = ack2 as GameLogEntry

    // Should return the same seq (not a new row)
    expect(entry2.seq).toBe(entry1.seq)
    // Original payload should be preserved
    expect(entry2.payload).toEqual({ text: 'Original' })
  })

  // ── log:roll-request ──

  it('log:roll-request: ack has rolls array (pure RNG, no game_log entry)', async () => {
    const request = {
      dice: [{ sides: 6, count: 2 }],
    }

    const ack = await emitRollRequest(ctx.socket, request)
    expect('error' in ack).toBe(false)
    const result = ack as { rolls: number[][] }

    // Should return rolls directly — no seq, no type, no executor
    expect(Array.isArray(result.rolls)).toBe(true)
    expect(result.rolls).toHaveLength(1)
    expect(result.rolls[0]).toHaveLength(2)
    // Each roll should be between 1 and 6
    for (const roll of result.rolls[0]!) {
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(6)
    }

    // No broadcast — pure RNG does not emit to other clients
  })

  // ── log:roll-request invalid dice ──

  it('log:roll-request invalid dice: bad sides → ack has error', async () => {
    const request = {
      origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      dice: [{ sides: 0, count: 2 }],
      formula: '2d0',
    }

    const ack = await emitRollRequest(ctx.socket, request)
    expect('error' in ack).toBe(true)
    expect((ack as { error: string }).error).toContain('Invalid dice sides')
  })

  it('log:roll-request invalid dice: sides too large → ack has error', async () => {
    const request = {
      origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      dice: [{ sides: 1001, count: 1 }],
      formula: '1d1001',
    }

    const ack = await emitRollRequest(ctx.socket, request)
    expect('error' in ack).toBe(true)
    expect((ack as { error: string }).error).toContain('Invalid dice sides')
  })

  it('log:roll-request invalid dice: count too large → ack has error', async () => {
    const request = {
      origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      dice: [{ sides: 6, count: 101 }],
      formula: '101d6',
    }

    const ack = await emitRollRequest(ctx.socket, request)
    expect('error' in ack).toBe(true)
    expect((ack as { error: string }).error).toContain('Invalid dice count')
  })

  // ── log:history ──

  it('log:history: query with limit and beforeSeq', async () => {
    // Insert several entries to work with
    for (let i = 0; i < 5; i++) {
      await emitLogEntry(ctx.socket, {
        id: `history-entry-${i}`,
        type: 'core:text',
        origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
        chainDepth: 0,
        triggerable: false,
        visibility: {},
        baseSeq: 0,
        payload: { text: `Message ${i}` },
        timestamp: Date.now(),
      })
    }

    // Fetch all history
    const allEntries = await emitLogHistory(ctx.socket, { limit: 500 })
    expect(allEntries.length).toBeGreaterThanOrEqual(5)

    // Should be in seq ASC order
    for (let i = 1; i < allEntries.length; i++) {
      expect(allEntries[i]!.seq).toBeGreaterThan(allEntries[i - 1]!.seq)
    }

    // Fetch with limit
    const limited = await emitLogHistory(ctx.socket, { limit: 3 })
    expect(limited).toHaveLength(3)

    // Fetch with beforeSeq — should return entries before the given seq
    const lastEntry = allEntries[allEntries.length - 1]!
    const before = await emitLogHistory(ctx.socket, {
      beforeSeq: lastEntry.seq,
      limit: 2,
    })
    expect(before).toHaveLength(2)
    for (const entry of before) {
      expect(entry.seq).toBeLessThan(lastEntry.seq)
    }
    // Should be in ASC order
    expect(before[0]!.seq).toBeLessThan(before[1]!.seq)
  })

  // ── No seat → error ──

  it('no seat → error: log:entry without claiming seat returns error', async () => {
    // Connect a fresh socket without claiming any seat
    const unclaimed = await connectSecondClient(ctx.apiBase, ctx.roomId)
    try {
      const submission = {
        id: 'no-seat-entry',
        type: 'core:text',
        origin: { seat: { id: 'fake', name: 'Fake', color: '#000' } },
        chainDepth: 0,
        triggerable: false,
        visibility: {},
        baseSeq: 0,
        payload: { text: 'Should fail' },
        timestamp: Date.now(),
      }

      const ack = await emitLogEntry(unclaimed, submission)
      expect('error' in ack).toBe(true)
      expect((ack as { error: string }).error).toBe('No seat claimed')
    } finally {
      unclaimed.disconnect()
    }
  })

  // ── Visibility filtering ──

  it('visibility include: excluded seat does NOT receive broadcast', async () => {
    // Create a second seat for the excluded client
    const { data: seat2Data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
      name: 'Player',
      role: 'PL',
      color: '#0066ff',
    })
    const seat2Id = (seat2Data as { id: string }).id

    // Create two fresh clients, each claiming a different seat
    const clientA = await connectSecondClient(ctx.apiBase, ctx.roomId)
    const clientB = await connectSecondClient(ctx.apiBase, ctx.roomId)

    try {
      // Claim seats
      clientA.emit('seat:claim', { seatId } as never)
      clientB.emit('seat:claim', { seatId: seat2Id } as never)
      await new Promise((r) => setTimeout(r, 100))

      // Set up broadcast listeners: clientA (included) should receive, clientB (excluded) should NOT
      const clientAPromise = waitForSocketEvent<GameLogEntry>(clientA, 'log:new')
      let clientBReceived = false
      const clientBHandler = () => {
        clientBReceived = true
      }
      clientB.on('log:new', clientBHandler)

      // Emit entry visible only to seat-1 (the GM seat)
      const submission = {
        id: 'visibility-test-001',
        type: 'core:text',
        origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
        chainDepth: 0,
        triggerable: false,
        visibility: { include: [seatId] },
        baseSeq: 0,
        payload: { text: 'Secret GM message' },
        timestamp: Date.now(),
      }

      const ack = await emitLogEntry(ctx.socket, submission)
      expect('error' in ack).toBe(false)

      // clientA (seat-1, included) should receive the broadcast
      const broadcast = await clientAPromise
      expect(broadcast.id).toBe('visibility-test-001')

      // Wait a bit to ensure clientB would have received it if it were going to
      await new Promise((r) => setTimeout(r, 200))
      expect(clientBReceived).toBe(false)

      clientB.off('log:new', clientBHandler)
    } finally {
      clientA.disconnect()
      clientB.disconnect()
    }
  })

  // ── Type namespace validation ──

  it('log:entry rejects type without namespace prefix', async () => {
    const submission = {
      id: 'test-ns-validation-001',
      type: 'text', // missing namespace prefix
      origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
      chainDepth: 0,
      triggerable: false,
      visibility: {},
      baseSeq: 0,
      payload: { text: 'Hello' },
      timestamp: Date.now(),
    }

    const ack = await emitLogEntry(ctx.socket, submission)
    expect('error' in ack).toBe(true)
    expect((ack as { error: string }).error).toContain('namespace')
  })

  // ── No seat → error ──

  it('no seat → error: log:roll-request without claiming seat returns error', async () => {
    const unclaimed = await connectSecondClient(ctx.apiBase, ctx.roomId)
    try {
      const request = {
        origin: { seat: { id: 'fake', name: 'Fake', color: '#000' } },
        chainDepth: 0,
        triggerable: false,
        visibility: {},
        dice: [{ sides: 6, count: 1 }],
        formula: '1d6',
      }

      const ack = await emitRollRequest(unclaimed, request)
      expect('error' in ack).toBe(true)
      expect((ack as { error: string }).error).toBe('No seat claimed')
    } finally {
      unclaimed.disconnect()
    }
  })

  // ── groupId support ──

  describe('groupId support', () => {
    it('log:entry with groupId is stored and returned in ack', async () => {
      // Drain the broadcast so it does not bleed into the next test
      const broadcastPromise = waitForSocketEvent<GameLogEntry>(secondClient, 'log:new')

      const submission = {
        id: 'test-groupid-entry-001',
        type: 'core:text',
        origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
        chainDepth: 0,
        triggerable: false,
        visibility: {},
        baseSeq: 0,
        payload: { text: 'Entry with groupId' },
        timestamp: Date.now(),
        groupId: 'test-group-1',
      }

      const ack = await emitLogEntry(ctx.socket, submission)
      expect('error' in ack).toBe(false)
      const entry = ack as GameLogEntry
      expect(entry.groupId).toBe('test-group-1')

      await broadcastPromise
    })

    it('log:entry groupId is broadcast to other clients', async () => {
      const broadcastPromise = waitForSocketEvent<GameLogEntry>(secondClient, 'log:new')

      const submission = {
        id: 'test-groupid-broadcast-001',
        type: 'core:text',
        origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
        chainDepth: 0,
        triggerable: false,
        visibility: {},
        baseSeq: 0,
        payload: { text: 'Broadcast with groupId' },
        timestamp: Date.now(),
        groupId: 'test-group-1',
      }

      await emitLogEntry(ctx.socket, submission)

      const broadcast = await broadcastPromise
      expect(broadcast.id).toBe('test-groupid-broadcast-001')
      expect(broadcast.groupId).toBe('test-group-1')
    })

    it('log:roll-request ignores groupId (pure RNG, no game_log entry)', async () => {
      const request = {
        dice: [{ sides: 6, count: 1 }],
      }

      const ack = await emitRollRequest(ctx.socket, request)
      expect('error' in ack).toBe(false)
      const result = ack as { rolls: number[][] }
      // Only rolls returned — no groupId, no seq, no game_log storage
      expect(Array.isArray(result.rolls)).toBe(true)
      expect(result.rolls).toHaveLength(1)
    })

    it('log:entry without groupId defaults to empty string', async () => {
      const submission = {
        id: 'test-groupid-missing-001',
        type: 'core:text',
        origin: { seat: { id: seatId, name: 'GM', color: '#ff6600' } },
        chainDepth: 0,
        triggerable: false,
        visibility: {},
        baseSeq: 0,
        payload: { text: 'No groupId' },
        timestamp: Date.now(),
        // groupId intentionally omitted
      }

      const ack = await emitLogEntry(ctx.socket, submission)
      expect('error' in ack).toBe(false)
      const entry = ack as GameLogEntry
      expect(entry.groupId).toBe('')
    })
  })
})
