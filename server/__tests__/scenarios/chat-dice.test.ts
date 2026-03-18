// @vitest-environment node
// server/__tests__/scenarios/chat-dice.test.ts
// Integration test: chat messaging and dice roll system
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('chat-dice-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Chat & Dice Roll Journey', () => {
  let seatId: string
  let textMsgId: string
  let rollMsgId: string

  it('setup: create a GM seat for senderId', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
      name: 'GM',
      role: 'GM',
      color: '#ff6600',
    })
    seatId = (data as { id: string }).id
    expect(seatId).toBeTruthy()
  })

  // ── 6.1 Send text message ──

  it('6.1 send text message → returned with server id + timestamp', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/chat`, {
      senderId: seatId,
      senderName: 'GM',
      senderColor: '#ff6600',
      content: 'Welcome to the dungeon!',
    })
    expect(status).toBe(201)

    const msg = data as Record<string, unknown>
    expect(msg.id).toBeTruthy()
    expect(msg.type).toBe('text')
    expect(msg.content).toBe('Welcome to the dungeon!')
    expect(msg.senderName).toBe('GM')
    expect(msg.senderColor).toBe('#ff6600')
    expect(msg.senderId).toBe(seatId)
    expect(typeof msg.timestamp).toBe('number')

    textMsgId = msg.id as string
    // Verify via GET
    const { data: history } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/chat`)
    const messages = history as Record<string, unknown>[]
    expect(messages).toHaveLength(1)
    expect(messages[0]!.id).toBe(textMsgId)
    expect(messages[0]!.content).toBe('Welcome to the dungeon!')
  })

  // ── 6.2 Send dice roll ──

  it('6.2 send dice roll → returned with raw rolls', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/roll`, {
      senderId: seatId,
      senderName: 'GM',
      senderColor: '#ff6600',
      formula: '2d6+3',
      dice: [{ sides: 6, count: 2 }],
    })
    expect(status).toBe(201)

    const msg = data as Record<string, unknown>
    expect(msg.id).toBeTruthy()
    expect(msg.type).toBe('roll')
    // rollData fields are flattened to top level by toMessage()
    expect(msg.formula).toBe('2d6+3')
    expect(Array.isArray(msg.rolls)).toBe(true)
    expect((msg.rolls as number[][])[0]).toHaveLength(2)

    rollMsgId = msg.id as string

    // Verify in GET /chat
    const { data: history } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/chat`)
    const messages = history as Record<string, unknown>[]
    expect(messages).toHaveLength(2)
    const rollMsg = messages.find((m) => m.type === 'roll')
    expect(rollMsg).toBeTruthy()
    expect(rollMsg!.formula).toBe('2d6+3')
    expect(Array.isArray(rollMsg!.rolls)).toBe(true)
  })

  // ── 6.3 Retract text message ──

  it('6.3 retract text message → message deleted from history', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/chat/retract/${textMsgId}`,
    )
    expect(status).toBe(200)
    expect((data as { ok: boolean }).ok).toBe(true)

    // Verify message is gone from history
    const { data: history } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/chat`)
    const messages = history as Record<string, unknown>[]
    expect(messages.find((m) => m.id === textMsgId)).toBeUndefined()
  })

  // ── 6.4 Retract roll message ──
  // The server allows retracting any message type (no type restriction)

  it('6.4 retract roll message → also succeeds', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/chat/retract/${rollMsgId}`,
    )
    expect(status).toBe(200)
    expect((data as { ok: boolean }).ok).toBe(true)

    // Verify roll message is gone
    const { data: history } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/chat`)
    expect(history as unknown[]).toHaveLength(0)
  })

  // ── 6.5 Incremental fetch with ?after= ──

  it('6.5 incremental fetch with ?after= returns only newer messages', async () => {
    // Send three messages rapidly (may share the same millisecond timestamp)
    const { data: msg1 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/chat`, {
      senderId: seatId,
      senderName: 'GM',
      senderColor: '#ff6600',
      content: 'First',
    })
    const firstId = (msg1 as { id: string }).id

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/chat`, {
      senderId: seatId,
      senderName: 'GM',
      senderColor: '#ff6600',
      content: 'Second',
    })

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/chat`, {
      senderId: seatId,
      senderName: 'GM',
      senderColor: '#ff6600',
      content: 'Third',
    })

    // Fetch with after=firstId — cursor-based, returns messages inserted after "First"
    const { data: afterFirst } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/chat?after=${firstId}`,
    )
    const afterMessages = afterFirst as { content: string }[]
    expect(afterMessages).toHaveLength(2)
    expect(afterMessages[0]!.content).toBe('Second')
    expect(afterMessages[1]!.content).toBe('Third')
  })

  // ── 6.6 Limit fetch with ?limit= ──

  it('6.6 limit fetch with ?limit= returns only N messages', async () => {
    // We have 3 messages from the previous test
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/chat?limit=2`)
    const messages = data as unknown[]
    expect(messages).toHaveLength(2)
  })

  // ── Edge cases ──

  it('6.7 rejects text message without content', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/chat`, {
      senderId: seatId,
      senderName: 'GM',
      senderColor: '#ff6600',
    })
    expect(status).toBe(400)
  })

  it('6.8 retract non-existent message returns 404', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/chat/retract/non-existent-id`,
    )
    expect(status).toBe(404)
  })
})
