// server/__tests__/scenarios/seat-management.test.ts
// Integration test: seat CRUD lifecycle
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('seat-management-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Seat Management Journey', () => {
  let gmSeatId: string
  let plSeatId: string

  // ── 7.1 Create GM seat ──

  it('7.1 create GM seat → 201 with role GM', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
      name: 'Game Master',
      role: 'GM',
      color: '#ff6600',
    })
    expect(status).toBe(201)

    const seat = data as Record<string, unknown>
    expect(seat.name).toBe('Game Master')
    expect(seat.role).toBe('GM')
    expect(seat.color).toBe('#ff6600')
    expect(seat.id).toBeTruthy()
    gmSeatId = seat.id as string
  })

  // ── 7.2 Create PL seat with color ──

  it('7.2 create PL seat with custom color → color is preserved', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
      name: 'Alice',
      role: 'PL',
      color: '#e91e63',
    })
    expect(status).toBe(201)

    const seat = data as Record<string, unknown>
    expect(seat.name).toBe('Alice')
    expect(seat.role).toBe('PL')
    expect(seat.color).toBe('#e91e63')
    plSeatId = seat.id as string
  })

  // ── 7.3 Update seat name and portrait ──

  it('7.3 update seat name and portrait → changes reflected in GET', async () => {
    const { status, data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/seats/${plSeatId}`, {
      name: 'Alice the Brave',
      portraitUrl: '/portraits/alice.png',
    })
    expect(status).toBe(200)

    const updated = data as Record<string, unknown>
    expect(updated.name).toBe('Alice the Brave')
    expect(updated.portraitUrl).toBe('/portraits/alice.png')

    // Verify via GET
    const { data: seats } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/seats`)
    const list = seats as Record<string, unknown>[]
    const alice = list.find((s) => s.id === plSeatId)
    expect(alice).toBeTruthy()
    expect(alice!.name).toBe('Alice the Brave')
    expect(alice!.portraitUrl).toBe('/portraits/alice.png')
  })

  // ── 7.4 Claim seat ──

  it('7.4 claim seat → userId is set', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/seats/${plSeatId}/claim`,
      {
        userId: 'user-alice-123',
      },
    )
    expect(status).toBe(200)

    const seat = data as Record<string, unknown>
    expect(seat.userId).toBe('user-alice-123')

    // Verify via GET
    const { data: seats } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/seats`)
    const list = seats as Record<string, unknown>[]
    const alice = list.find((s) => s.id === plSeatId)
    expect(alice!.userId).toBe('user-alice-123')
  })

  // ── 7.5 Delete seat ──

  it('7.5 delete seat → GET returns one fewer', async () => {
    // Before deletion: 2 seats (GM + PL)
    const { data: before } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/seats`)
    expect(before as unknown[]).toHaveLength(2)

    // Delete the PL seat
    const { status, data } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/seats/${plSeatId}`)
    expect(status).toBe(200)
    expect((data as { ok: boolean }).ok).toBe(true)

    // After deletion: 1 seat
    const { data: after } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/seats`)
    expect(after as unknown[]).toHaveLength(1)
    expect((after as { id: string }[])[0]!.id).toBe(gmSeatId)
  })

  // ── 7.6 Contract: seat fields are camelCase ──

  it('7.6 contract: seat fields use camelCase (no snake_case leak)', async () => {
    const { data: seats } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/seats`)
    const list = seats as Record<string, unknown>[]
    expect(list).toHaveLength(1)

    const seat = list[0]
    // camelCase fields present
    expect(seat).toHaveProperty('id')
    expect(seat).toHaveProperty('name')
    expect(seat).toHaveProperty('color')
    expect(seat).toHaveProperty('role')
    expect(seat).toHaveProperty('sortOrder')
    // snake_case must NOT leak
    expect(seat).not.toHaveProperty('sort_order')
    expect(seat).not.toHaveProperty('user_id')
    expect(seat).not.toHaveProperty('portrait_url')
    expect(seat).not.toHaveProperty('active_character_id')
  })

  // ── Edge cases ──

  it('7.7 create seat without required fields → 400', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
      name: 'Bob',
    })
    expect(status).toBe(400)
  })

  it('7.8 update non-existent seat → 404', async () => {
    const { status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/seats/non-existent`, {
      name: 'Ghost',
    })
    expect(status).toBe(404)
  })

  it('7.9 claim non-existent seat → 404', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats/non-existent/claim`, {
      userId: 'user-ghost',
    })
    expect(status).toBe(404)
  })

  it('7.10 update seat color and role', async () => {
    const { data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/seats/${gmSeatId}`, {
      color: '#00ff00',
      role: 'PL',
    })
    const seat = data as Record<string, unknown>
    expect(seat.color).toBe('#00ff00')
    expect(seat.role).toBe('PL')

    // Verify persistence via GET
    const { data: seats } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/seats`)
    const list = seats as Record<string, unknown>[]
    const updated = list.find((s) => s.id === gmSeatId)
    expect(updated!.color).toBe('#00ff00')
    expect(updated!.role).toBe('PL')
  })
})
