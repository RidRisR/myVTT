// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, waitForSocketEvent, type TestContext } from '../helpers/test-server'

describe('rule system switch', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await setupTestRoom('rule-system-test')
  })
  afterAll(() => ctx.cleanup())

  it('defaults to generic on room creation', async () => {
    const res = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect(res.status).toBe(200)
    expect((res.data as { ruleSystemId: string }).ruleSystemId).toBe('generic')
  })

  it('PATCH ruleSystemId updates DB and emits socket event', async () => {
    const eventPromise = waitForSocketEvent<{ ruleSystemId: string }>(
      ctx.socket,
      'room:state:updated',
    )

    const res = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, {
      ruleSystemId: 'daggerheart',
    })
    expect(res.status).toBe(200)
    expect((res.data as { ruleSystemId: string }).ruleSystemId).toBe('daggerheart')

    const event = await eventPromise
    expect(event.ruleSystemId).toBe('daggerheart')
  })

  it('persists across GET after PATCH', async () => {
    const res = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect((res.data as { ruleSystemId: string }).ruleSystemId).toBe('daggerheart')
  })

  it('can switch back to generic', async () => {
    const res = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, {
      ruleSystemId: 'generic',
    })
    expect((res.data as { ruleSystemId: string }).ruleSystemId).toBe('generic')
  })
})
