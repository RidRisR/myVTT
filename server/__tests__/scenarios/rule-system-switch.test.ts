// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

describe('rule system', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await setupTestRoom('rule-system-test')
  })
  afterAll(() => ctx.cleanup())

  it('defaults to generic on room creation', async () => {
    const { data: rooms } = await ctx.api('GET', '/api/rooms')
    const room = (rooms as Array<{ id: string; ruleSystemId: string }>).find(
      (r) => r.id === ctx.roomId,
    )
    expect(room?.ruleSystemId).toBe('generic')
  })

  it('room created with custom ruleSystemId', async () => {
    const { status, data } = await ctx.api('POST', '/api/rooms', {
      name: 'DH Room',
      ruleSystemId: 'daggerheart',
    })
    expect(status).toBe(201)
    const created = data as { id: string; ruleSystemId: string }
    expect(created.ruleSystemId).toBe('daggerheart')

    // Verify persisted in rooms table
    const { data: rooms } = await ctx.api('GET', '/api/rooms')
    const found = (rooms as Array<{ id: string; ruleSystemId: string }>).find(
      (r) => r.id === created.id,
    )
    expect(found?.ruleSystemId).toBe('daggerheart')
  })

  it('GET /rooms/:id returns ruleSystemId', async () => {
    const { status, data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}`)
    expect(status).toBe(200)
    expect((data as { ruleSystemId: string }).ruleSystemId).toBe('generic')
  })
})
