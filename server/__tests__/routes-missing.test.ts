// server/__tests__/routes-missing.test.ts — Tests for newly implemented endpoints
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestServer, type SimpleTestServer } from './helpers/test-server'

let ctx: SimpleTestServer

beforeAll(async () => {
  ctx = await setupTestServer()
})

afterAll(() => {
  ctx.cleanup()
})

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
async function api<T = Record<string, unknown>>(
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const result = await ctx.api(method, urlPath, body)
  return result as { status: number; data: T }
}

async function createRoom(name = 'Missing Endpoint Room') {
  const { data } = await api('POST', '/api/rooms', { name })
  return data.id as string
}

describe('POST /seats/:id/claim', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Claim Test Room')
  })

  it('creates a seat, claims it, and verifies userId is set', async () => {
    // Create seat
    const { status: createStatus, data: seat } = await api('POST', `/api/rooms/${roomId}/seats`, {
      name: 'Ranger',
      color: '#228b22',
      role: 'PL',
    })
    expect(createStatus).toBe(201)
    expect(seat.userId).toBeNull()

    // Claim it
    const { status: claimStatus, data: claimed } = await api(
      'POST',
      `/api/rooms/${roomId}/seats/${String(seat.id)}/claim`,
      { userId: 'player-42' },
    )
    expect(claimStatus).toBe(200)
    expect(claimed.userId).toBe('player-42')

    // Verify via list
    const { data: seats } = await api<Array<{ id: string; userId: string | null }>>(
      'GET',
      `/api/rooms/${roomId}/seats`,
    )
    const found = seats.find((s) => s.id === (seat.id as string))
    expect(found).toBeDefined()
    expect(found!.userId).toBe('player-42')
  })

  it('returns 404 for non-existent seat', async () => {
    const { status } = await api('POST', `/api/rooms/${roomId}/seats/no-such-seat/claim`, {
      userId: 'user-1',
    })
    expect(status).toBe(404)
  })
})

describe('POST /showcase/:id/pin + POST /showcase/unpin', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Showcase Pin Room')
  })

  it('creates item, pins it, and verifies pinned=true in GET', async () => {
    // Create showcase item
    const { status: createStatus, data: item } = await api(
      'POST',
      `/api/rooms/${roomId}/showcase`,
      { type: 'image', data: { imageUrl: 'map.png', title: 'Battle Map' } },
    )
    expect(createStatus).toBe(201)
    expect(item.pinned).toBe(false)

    // Pin it
    const { status: pinStatus, data: pinData } = await api(
      'POST',
      `/api/rooms/${roomId}/showcase/${item.id as string}/pin`,
    )
    expect(pinStatus).toBe(200)
    expect(pinData.ok).toBe(true)

    // Verify pinned=true via GET
    const { data: items } = await api<Array<{ id: string; pinned: boolean }>>(
      'GET',
      `/api/rooms/${roomId}/showcase`,
    )
    const found = items.find((i) => i.id === (item.id as string))
    expect(found).toBeDefined()
    expect(found!.pinned).toBe(true)
  })

  it('returns 404 when pinning non-existent item', async () => {
    const { status } = await api('POST', `/api/rooms/${roomId}/showcase/does-not-exist/pin`)
    expect(status).toBe(404)
  })

  it('pins item then unpins all, verifies pinned=false', async () => {
    // Create and pin an item
    const { data: item } = await api('POST', `/api/rooms/${roomId}/showcase`, {
      type: 'image',
      data: { imageUrl: 'handout.jpg', title: 'Letter' },
    })
    await api('POST', `/api/rooms/${roomId}/showcase/${item.id as string}/pin`)

    // Verify pinned
    const { data: beforeUnpin } = await api<Array<{ id: string; pinned: boolean }>>(
      'GET',
      `/api/rooms/${roomId}/showcase`,
    )
    const pinnedItem = beforeUnpin.find((i) => i.id === (item.id as string))
    expect(pinnedItem!.pinned).toBe(true)

    // Unpin all
    const { status: unpinStatus, data: unpinData } = await api(
      'POST',
      `/api/rooms/${roomId}/showcase/unpin`,
    )
    expect(unpinStatus).toBe(200)
    expect(unpinData.ok).toBe(true)

    // Verify all unpinned
    const { data: afterUnpin } = await api<Array<{ pinned: boolean }>>(
      'GET',
      `/api/rooms/${roomId}/showcase`,
    )
    for (const i of afterUnpin) {
      expect(i.pinned).toBe(false)
    }
  })
})
