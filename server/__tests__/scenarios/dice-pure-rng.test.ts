// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('dice-pure-rng-test')
})

afterAll(async () => {
  await ctx.cleanup()
})

const origin = { seat: { id: 's1', name: 'Tester', color: '#fff' } }

describe('POST /api/rooms/:roomId/roll — pure RNG', () => {
  it('returns raw rolls matching dice spec', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/roll`, {
      dice: [{ sides: 12, count: 2 }],
      formula: '2d12',
      rollType: 'daggerheart:dd',
      origin,
    })
    expect(status).toBe(201)
    const msg = data as Record<string, unknown>
    expect(msg.type).toBe('roll')
    expect(Array.isArray(msg.rolls)).toBe(true)
    expect(msg.rolls as number[][]).toHaveLength(1)
    expect((msg.rolls as number[][])[0]).toHaveLength(2)
    expect((msg.rolls as number[][])[0]![0]).toBeGreaterThanOrEqual(1)
    expect((msg.rolls as number[][])[0]![0]).toBeLessThanOrEqual(12)
    expect(msg.rollType).toBe('daggerheart:dd')
    expect(msg.formula).toBe('2d12')
    // 服务端不再提供 terms 或 total
    expect(msg.terms).toBeUndefined()
    expect(msg.total).toBeUndefined()
  })

  it('rejects missing dice', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/roll`, {
      formula: '2d12',
      origin,
    })
    expect(status).toBe(400)
  })

  it('rejects dice with invalid sides', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/roll`, {
      dice: [{ sides: 0, count: 1 }],
      formula: '1d0',
      origin,
    })
    expect(status).toBe(400)
  })

  it('rejects dice with count exceeding limit', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/roll`, {
      dice: [{ sides: 6, count: 101 }],
      formula: '101d6',
      origin,
    })
    expect(status).toBe(400)
  })

  it('supports multiple dice groups', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/roll`, {
      dice: [
        { sides: 6, count: 2 },
        { sides: 8, count: 1 },
      ],
      formula: '2d6+1d8',
      origin,
    })
    expect(status).toBe(201)
    const msg = data as Record<string, unknown>
    expect(msg.rolls as number[][]).toHaveLength(2)
    expect((msg.rolls as number[][])[0]).toHaveLength(2)
    expect((msg.rolls as number[][])[1]).toHaveLength(1)
  })
})
