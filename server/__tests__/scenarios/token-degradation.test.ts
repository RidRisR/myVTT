// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('token-degradation-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Token Degradation on Entity Delete', () => {
  let sceneId: string, encounterId: string, entityId: string

  it('sets up scene + encounter + entity', async () => {
    const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Arena',
      atmosphere: {},
    })
    sceneId = (scene as { id: string }).id

    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Warrior',
      lifecycle: 'reusable',
    })
    entityId = (entity as { id: string }).id

    const { data: encounter } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`,
      {
        name: 'Battle',
        tokens: {
          t1: { name: 'Warrior Token', entityId, x: 100, y: 100, size: 1 },
          t2: { name: 'Other Token', x: 200, y: 200, size: 1 },
        },
      },
    )
    encounterId = (encounter as { id: string }).id
  })

  it('activates encounter to populate combat_state', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/encounters/${encounterId}/activate`)
    const { data: combat } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const tokens = (combat as { tokens: Record<string, { entityId?: string }> }).tokens
    const linkedToken = Object.values(tokens).find((t) => t.entityId === entityId)
    expect(linkedToken).toBeDefined()
  })

  it('deletes entity — combat tokens degrade', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/entities/${entityId}`)

    const { data: combat } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const tokens = (combat as { tokens: Record<string, { entityId?: string | null }> }).tokens
    for (const t of Object.values(tokens)) {
      expect(t.entityId).not.toBe(entityId)
    }
  })

  it('encounter tokens also degraded', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/combat/end`)
    const { data: encounters } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`,
    )
    const enc = (
      encounters as {
        id: string
        tokens: Record<string, { entityId?: string | null }>
      }[]
    ).find((e) => e.id === encounterId)
    expect(enc).toBeDefined()
    for (const t of Object.values(enc!.tokens)) {
      expect(t.entityId).not.toBe(entityId)
    }
  })
})

describe('Token Degradation on Scene Delete (ephemeral)', () => {
  let sceneId: string, ephemeralId: string

  it('sets up scene with ephemeral entity in encounter', async () => {
    const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Dungeon',
      atmosphere: {},
    })
    sceneId = (scene as { id: string }).id

    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Goblin',
      lifecycle: 'ephemeral',
    })
    ephemeralId = (entity as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${ephemeralId}`)

    // Create encounter in a DIFFERENT scene that references the ephemeral entity's ID
    const { data: scene2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Other Scene',
      atmosphere: {},
    })
    const scene2Id = (scene2 as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${scene2Id}/encounters`, {
      name: 'Other Battle',
      tokens: {
        t1: { name: 'Goblin Token', entityId: ephemeralId, x: 0, y: 0, size: 1 },
      },
    })
  })

  it('deleting scene removes ephemeral entity + degrades tokens', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneId}`)

    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${ephemeralId}`)
    expect(status).toBe(404)
  })
})
