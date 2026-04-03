// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('tactical-tokens-cascade-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Tactical Token Cascade', () => {
  it('deleting entity cascades to tactical_token', async () => {
    // Setup
    const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Cascade Scene',
      atmosphere: {},
    })
    const sceneId = (scene as { id: string }).id
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })

    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Doomed Warrior',
      lifecycle: 'persistent',
    })
    const entityId = (entity as { id: string }).id

    // Create token
    const { data: token } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens`, {
      entityId,
      x: 10,
      y: 20,
    })
    const tokenId = (token as { id: string }).id

    // Verify token exists
    const { data: before } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const beforeTokens = (before as { tokens: { id: string }[] }).tokens
    expect(beforeTokens.some((t) => t.id === tokenId)).toBe(true)

    // Delete entity — should cascade to token
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/entities/${entityId}`)

    // Verify token is gone
    const { data: after } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const afterTokens = (after as { tokens: { id: string }[] }).tokens
    expect(afterTokens.some((t) => t.id === tokenId)).toBe(false)
  })

  it('deleting scene cascades to tactical_state and tokens', async () => {
    // Create a new scene
    const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Temp Scene',
      atmosphere: {},
    })
    const sceneId = (scene as { id: string }).id
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })

    // Create entity and token
    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Scout',
      lifecycle: 'persistent',
    })
    const entityId = (entity as { id: string }).id

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens`, {
      entityId,
      x: 0,
      y: 0,
    })

    // Verify tactical state exists
    const { status: beforeStatus } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect(beforeStatus).toBe(200)

    // Delete scene — should cascade
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneId}`)

    // Active scene is cleared, so GET /tactical returns 404
    const { status: afterStatus } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect(afterStatus).toBe(404)

    // Entity should still exist (persistent, not tactical-in-scene)
    const { status: entityStatus } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities/${entityId}`,
    )
    expect(entityStatus).toBe(200)
  })
})
