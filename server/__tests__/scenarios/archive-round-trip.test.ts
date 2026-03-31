// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'
import type { Entity } from '../../../src/shared/entityTypes'
import { getName } from '../../../src/shared/coreComponents'

let ctx: TestContext
let sceneId: string

beforeAll(async () => {
  ctx = await setupTestRoom('archive-round-trip')

  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Round-trip Scene',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Archive round-trip: save then load restores full state', () => {
  it('save snapshots tokens + round state, load restores them after clear', async () => {
    // ── Arrange: create tokens on the battlefield ──

    // Ephemeral token via quick-create (returns { entity, token })
    const { data: quick1 } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
      { x: 10, y: 20, name: 'Goblin A' },
    )
    const q1 = quick1 as { entity: { id: string }; token: { id: string } }
    const token1Id = q1.token.id

    const { data: quick2 } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
      { x: 30, y: 40, name: 'Goblin B' },
    )
    const q2 = quick2 as { entity: { id: string }; token: { id: string } }
    const token2Id = q2.token.id

    // Set round state
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      roundNumber: 3,
      currentTurnTokenId: token1Id,
    })

    // Verify pre-save state
    const { data: preSave } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const pre = preSave as {
      tokens: { id: string; x: number; y: number; entityId: string }[]
      roundNumber: number
      currentTurnTokenId: string | null
    }
    expect(pre.tokens).toHaveLength(2)
    expect(pre.roundNumber).toBe(3)
    expect(pre.currentTurnTokenId).toBe(token1Id)

    // ── Act: create archive + save ──
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Full Snapshot' },
    )
    const archiveId = (archive as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)

    // ── Clear the battlefield: delete both tokens, reset round ──
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/tactical/tokens/${token1Id}`)
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/tactical/tokens/${token2Id}`)
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      roundNumber: 0,
      currentTurnTokenId: null,
    })

    // Verify cleared state
    const { data: cleared } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const cl = cleared as {
      tokens: unknown[]
      roundNumber: number
      currentTurnTokenId: string | null
    }
    expect(cl.tokens).toHaveLength(0)
    expect(cl.roundNumber).toBe(0)
    expect(cl.currentTurnTokenId).toBeNull()

    // ── Load the archive ──
    const { status, data: loaded } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`,
    )
    expect(status).toBe(200)

    const result = loaded as {
      tokens: { x: number; y: number; entityId: string }[]
      roundNumber: number
      currentTurnTokenId: string | null
    }

    // ── Assert: tokens restored with correct positions ──
    expect(result.tokens).toHaveLength(2)

    // Ephemeral tokens get new entity IDs on load, so verify via entity lookup
    const positions = result.tokens.map((t) => ({ x: t.x, y: t.y })).sort((a, b) => a.x - b.x)
    expect(positions).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ])

    // Verify entity names were restored from snapshot_data
    for (const token of result.tokens) {
      const { data: entity } = await ctx.api(
        'GET',
        `/api/rooms/${ctx.roomId}/entities/${token.entityId}`,
      )
      const e = entity as Entity
      expect(['Goblin A', 'Goblin B']).toContain(getName(e))
    }

    // ── Assert: round state restored ──
    expect(result.roundNumber).toBe(3)
    const { data: postLoad } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const post = postLoad as { roundNumber: number }
    expect(post.roundNumber).toBe(3)
  })

  it('save + load preserves reusable entity tokens with exact entity reference', async () => {
    // Create a reusable entity
    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'persistent',
      components: {
        'core:identity': { name: 'Dragon Boss', imageUrl: '', color: '#ef4444' },
      },
    })
    const entityId = (entity as { id: string }).id

    // Place as token
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`, {
      entityId,
      x: 50,
      y: 60,
    })

    // Create archive + save
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Reusable Snapshot' },
    )
    const archiveId = (archive as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)

    // Clear tokens
    const { data: tactical } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const tokens = (tactical as { tokens: { id: string }[] }).tokens
    for (const t of tokens) {
      await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/tactical/tokens/${t.id}`)
    }

    // Load archive
    const { data: loaded } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`,
    )
    const result = loaded as { tokens: { x: number; y: number; entityId: string }[] }

    // Reusable entity should keep its original entity ID (not create a new one)
    const dragonToken = result.tokens.find((t) => t.entityId === entityId)
    expect(dragonToken).toBeDefined()
    expect(dragonToken!.x).toBe(50)
    expect(dragonToken!.y).toBe(60)
  })

  it('roundNumber and currentTurnTokenId are stored in archive record', async () => {
    // Set specific round state
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      roundNumber: 7,
      currentTurnTokenId: 'token-abc',
    })

    // Create + save archive
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Round State Archive' },
    )
    const archiveId = (archive as { id: string }).id
    const { data: saved } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`,
    )

    // The save response returns the updated archive record with round fields
    const savedArchive = saved as { roundNumber: number; currentTurnTokenId: string | null }
    expect(savedArchive.roundNumber).toBe(7)
    expect(savedArchive.currentTurnTokenId).toBe('token-abc')

    // Verify via archive list endpoint
    const { data: archives } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
    )
    const found = (
      archives as { id: string; roundNumber: number; currentTurnTokenId: string | null }[]
    ).find((a) => a.id === archiveId)
    expect(found).toBeDefined()
    expect(found!.roundNumber).toBe(7)
    expect(found!.currentTurnTokenId).toBe('token-abc')
  })

  it('load restores roundNumber to tactical_state', async () => {
    // Reset round state to 0
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      roundNumber: 0,
      currentTurnTokenId: null,
    })

    // Set round 5 state
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      roundNumber: 5,
    })

    // Create + save
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Round 5 Archive' },
    )
    const archiveId = (archive as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)

    // Change round to something else
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, { roundNumber: 99 })

    // Load — should restore round 5
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`)

    const { data: tactical } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tactical as { roundNumber: number }).roundNumber).toBe(5)
  })
})
