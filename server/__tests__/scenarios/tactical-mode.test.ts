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

    // Verify via GET /state
    const { data: state } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect((state as { tacticalMode: number }).tacticalMode).toBe(1)
  })

  it('POST /tactical/exit sets tactical_mode=0', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/exit`)
    expect(status).toBe(200)
    expect((data as { tacticalMode: number }).tacticalMode).toBe(0)

    // Verify via GET /state
    const { data: state } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect((state as { tacticalMode: number }).tacticalMode).toBe(0)
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
})
