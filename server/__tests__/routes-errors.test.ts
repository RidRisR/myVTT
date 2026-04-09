// server/__tests__/routes-errors.test.ts — Error path + edge case tests for REST API routes
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestServer, type SimpleTestServer } from './helpers/test-server'

let ctx: SimpleTestServer

beforeAll(async () => {
  ctx = await setupTestServer()
})

afterAll(() => {
  ctx.cleanup()
})

// Helper: create a room and return its ID
async function createRoom(name = 'Error Test Room') {
  const { data } = await ctx.api('POST', '/api/rooms', { name })
  return (data as { id: string }).id
}

describe('Entity error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom()
  })

  it('PATCH /entities/:id with non-existent id returns 404', async () => {
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${roomId}/entities/nonexistent-id`,
      {
        components: { 'core:identity': { name: 'Ghost' } },
      },
    )
    expect(status).toBe(404)
    expect((data as { error: string }).error).toBe('Entity not found')
  })

  it('PATCH components — upsert replaces individual component data', async () => {
    const { data: entity } = await ctx.api('POST', `/api/rooms/${roomId}/entities`, {
      components: {
        'game:stats': {
          stats: {
            mental: { intelligence: 18, wisdom: 14 },
            physical: { strength: 8 },
          },
          level: 5,
        },
        'core:identity': { name: 'Wizard' },
      },
    })
    const entityId = (entity as { id: string }).id

    // Patch replaces the entire component value for the given key
    const { data: updated } = await ctx.api('PATCH', `/api/rooms/${roomId}/entities/${entityId}`, {
      components: {
        'game:stats': {
          stats: {
            mental: { intelligence: 18, wisdom: 16 },
            physical: { strength: 8 },
          },
          level: 5,
        },
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = updated as any
    // Updated field
    expect(u.components['game:stats'].stats.mental.wisdom).toBe(16)
    // Preserved fields within same component
    expect(u.components['game:stats'].stats.mental.intelligence).toBe(18)
    expect(u.components['game:stats'].stats.physical.strength).toBe(8)
    expect(u.components['game:stats'].level).toBe(5)
    // Other component preserved
    expect(u.components['core:identity'].name).toBe('Wizard')
  })

  it('PATCH components — array value replaces correctly', async () => {
    const { data: entity } = await ctx.api('POST', `/api/rooms/${roomId}/entities`, {
      components: {
        'core:identity': { name: 'Fighter' },
        'game:combat': {
          attacks: ['sword', 'shield bash'],
          hp: { current: 30, max: 30 },
        },
      },
    })
    const entityId = (entity as { id: string }).id

    // Patch replaces the entire component value
    const { data: updated } = await ctx.api('PATCH', `/api/rooms/${roomId}/entities/${entityId}`, {
      components: {
        'game:combat': {
          attacks: ['greataxe'],
          hp: { current: 30, max: 30 },
        },
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = updated as any
    expect(u.components['game:combat'].attacks).toEqual(['greataxe'])
    expect(u.components['game:combat'].hp.current).toBe(30)
    expect(u.components['game:combat'].hp.max).toBe(30)
  })
})

describe('Scene delete cascade', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Cascade Room')
  })

  it('DELETE /scenes/:id cascades to scene_entities', async () => {
    // Create scene
    const { data: scene } = await ctx.api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Dungeon',
    })
    const sceneId = (scene as { id: string }).id

    // Create non-persistent entity
    const { data: entity } = await ctx.api('POST', `/api/rooms/${roomId}/entities`, {
      components: { 'core:identity': { name: 'Goblin' } },
      lifecycle: 'persistent',
    })
    const entityId = (entity as { id: string }).id

    // Manually link entity to scene
    await ctx.api('POST', `/api/rooms/${roomId}/scenes/${sceneId}/entities/${entityId}`)

    // Verify link exists
    const { data: linked } = await ctx.api('GET', `/api/rooms/${roomId}/scenes/${sceneId}/entities`)
    expect((linked as { entityId: string }[]).map((r) => r.entityId)).toContain(entityId)

    // Delete scene
    await ctx.api('DELETE', `/api/rooms/${roomId}/scenes/${sceneId}`)

    // Entity still exists (only the link should be gone)
    const { status: entityStatus } = await ctx.api(
      'GET',
      `/api/rooms/${roomId}/entities/${entityId}`,
    )
    expect(entityStatus).toBe(200)

    // Create a new scene and verify no stale links for that entity
    const { data: scene2 } = await ctx.api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Forest',
    })
    const { data: linked2 } = await ctx.api(
      'GET',
      `/api/rooms/${roomId}/scenes/${(scene2 as { id: string }).id}/entities`,
    )
    expect((linked2 as { entityId: string }[]).map((r) => r.entityId)).not.toContain(entityId)
  })
})

describe('Archive gm_only filter', () => {
  let roomId: string
  let sceneId: string

  beforeAll(async () => {
    roomId = await createRoom('GM Filter Room')
    const { data: scene } = await ctx.api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Secret Scene',
    })
    sceneId = (scene as { id: string }).id
  })

  it('GET archives filters gm_only for PL role', async () => {
    // Create a public archive
    await ctx.api('POST', `/api/rooms/${roomId}/scenes/${sceneId}/archives`, {
      name: 'Public Fight',
      gmOnly: false,
    })

    // Create a gm_only archive
    await ctx.api('POST', `/api/rooms/${roomId}/scenes/${sceneId}/archives`, {
      name: 'Secret Ambush',
      gmOnly: true,
    })

    // PL should not see gm_only archive
    const plList = await ctx.api(
      'GET',
      `/api/rooms/${roomId}/scenes/${sceneId}/archives`,
      undefined,
      {
        'X-MyVTT-Role': 'PL',
      },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plNames = (plList.data as any[]).map((e: { name: string }) => e.name)
    expect(plNames).toContain('Public Fight')
    expect(plNames).not.toContain('Secret Ambush')

    // GM should see all archives
    const gmList = await ctx.api(
      'GET',
      `/api/rooms/${roomId}/scenes/${sceneId}/archives`,
      undefined,
      {
        'X-MyVTT-Role': 'GM',
      },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gmNames = (gmList.data as any[]).map((e: { name: string }) => e.name)
    expect(gmNames).toContain('Public Fight')
    expect(gmNames).toContain('Secret Ambush')
  })
})

describe('Showcase error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Showcase Error Room')
  })

  it('POST /showcase/:id/pin with non-existent id returns 404', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${roomId}/showcase/nonexistent-item/pin`,
    )
    expect(status).toBe(404)
    expect((data as { error: string }).error).toBe('Showcase item not found')
  })
})

describe('Seat error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Seat Error Room')
  })

  it('POST /seats/:id/claim — claim a seat updates user_id', async () => {
    const { data: seat } = await ctx.api('POST', `/api/rooms/${roomId}/seats`, {
      name: 'Player 1',
      color: '#00ff00',
      role: 'PL',
    })
    const seatId = (seat as { id: string }).id

    const { data: claimed } = await ctx.api('POST', `/api/rooms/${roomId}/seats/${seatId}/claim`, {
      userId: 'user-abc-123',
    })
    expect((claimed as { userId: string }).userId).toBe('user-abc-123')

    const { data: seats } = await ctx.api('GET', `/api/rooms/${roomId}/seats`)
    const found = (seats as { id: string; userId: string }[]).find((s) => s.id === seatId)
    expect(found!.userId).toBe('user-abc-123')
  })

  it('POST /seats with missing fields returns 400', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${roomId}/seats`, {
      name: 'Incomplete',
    })
    expect(status).toBe(400)
    expect((data as { error: string }).error).toContain('required')
  })

  it('PATCH /seats/:id with non-existent id returns 404', async () => {
    const { status, data } = await ctx.api('PATCH', `/api/rooms/${roomId}/seats/nonexistent-seat`, {
      name: 'Ghost',
    })
    expect(status).toBe(404)
    expect((data as { error: string }).error).toBe('Seat not found')
  })
})

describe('Scene error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Scene Error Room')
  })

  it('PATCH /scenes/:id with non-existent id returns 404', async () => {
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${roomId}/scenes/nonexistent-scene`,
      {
        name: 'Ghost Scene',
      },
    )
    expect(status).toBe(404)
    expect((data as { error: string }).error).toBe('Scene not found')
  })
})

describe('Tactical token error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Tactical Token Error Room')
  })

  it('PATCH /tactical/tokens/:tokenId with non-existent token returns 404', async () => {
    // Need an active scene first
    const { data: scene } = await ctx.api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Error Scene',
    })
    await ctx.api('PATCH', `/api/rooms/${roomId}/state`, {
      activeSceneId: (scene as { id: string }).id,
    })

    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${roomId}/tactical/tokens/nonexistent-token`,
      { x: 999 },
    )
    expect(status).toBe(404)
    expect((data as { error: string }).error).toBe('Token not found')
  })
})

describe('Showcase PATCH error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Showcase Patch Error Room')
  })

  it('PATCH /showcase/:id with non-existent id returns 404', async () => {
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${roomId}/showcase/nonexistent-item`,
      {
        pinned: true,
      },
    )
    expect(status).toBe(404)
    expect((data as { error: string }).error).toBe('Showcase item not found')
  })
})

describe('Archive error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Archive Error Room')
  })

  it('PATCH /archives/:id with non-existent id returns 404', async () => {
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${roomId}/archives/nonexistent-arc`,
      {
        name: 'Ghost Archive',
      },
    )
    expect(status).toBe(404)
    expect((data as { error: string }).error).toBe('Archive not found')
  })
})
