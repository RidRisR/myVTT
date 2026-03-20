// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('tactical-mode-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Tactical Mode', () => {
  let sceneId: string

  it('setup: create scene and entity', async () => {
    const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Battle Arena',
      atmosphere: {},
    })
    sceneId = (scene as { id: string }).id
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })

    // Add a token so we can verify it persists across enter/exit
    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Guard',
      lifecycle: 'reusable',
    })
    const entityId = (entity as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens`, {
      entityId,
      x: 50,
      y: 50,
    })
  })

  it('POST /tactical/enter sets tactical_mode=1', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)
    expect(status).toBe(200)
    expect((data as { tacticalMode: number }).tacticalMode).toBe(1)

    // Verify via GET /tactical
    const { data: tactical } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tactical as { tacticalMode: number }).tacticalMode).toBe(1)
  })

  it('POST /tactical/exit sets tactical_mode=0', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/exit`)
    expect(status).toBe(200)
    expect((data as { tacticalMode: number }).tacticalMode).toBe(0)

    // Verify via GET /tactical
    const { data: tactical } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tactical as { tacticalMode: number }).tacticalMode).toBe(0)
  })

  it('entering/exiting tactical mode does NOT clear tokens', async () => {
    // Enter
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)
    // Exit
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/exit`)
    // Tokens should still be there
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const tokens = (data as { tokens: unknown[] }).tokens
    expect(tokens.length).toBeGreaterThanOrEqual(1)
  })

  it('POST /tactical/clear removes all tokens and resets map', async () => {
    // Setup: enter tactical, add a token, set map
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/quick`, {
      x: 5,
      y: 5,
      name: 'Goblin',
      color: '#ff0000',
    })
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      mapUrl: '/uploads/test-map.png',
      mapWidth: 1000,
      mapHeight: 800,
    })

    // Act
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/clear`)
    expect(status).toBe(200)

    // Assert: tokens empty, map cleared, still in tactical mode
    const result = data as { tokens: unknown[]; mapUrl: string | null; tacticalMode: number }
    expect(result.tokens).toHaveLength(0)
    expect(result.mapUrl).toBeNull()
    expect(result.tacticalMode).toBe(1) // stays in tactical mode
  })
})
