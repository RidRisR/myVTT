// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('tactical-lifecycle-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Tactical Lifecycle', () => {
  let scene1Id: string
  let scene2Id: string
  let entityId: string

  it('setup: create two scenes and an entity', async () => {
    const { data: s1 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene 1',
      atmosphere: {},
    })
    scene1Id = (s1 as { id: string }).id

    const { data: s2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene 2',
      atmosphere: {},
    })
    scene2Id = (s2 as { id: string }).id

    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Warrior',
      lifecycle: 'reusable',
    })
    entityId = (entity as { id: string }).id
  })

  it('each scene has its own independent tactical_state', async () => {
    // Set scene1 active, add token
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene1Id })
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens`, {
      entityId,
      x: 100,
      y: 100,
    })
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      mapUrl: '/map1.jpg',
      mapWidth: 2000,
      mapHeight: 1500,
    })

    // Set scene2 active, add token at different position
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene2Id })
    // Need a different entity for scene2 since entityId already has token in scene1
    const { data: e2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Rogue',
      lifecycle: 'reusable',
    })
    const entity2Id = (e2 as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens`, {
      entityId: entity2Id,
      x: 500,
      y: 500,
    })
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      mapUrl: '/map2.jpg',
    })

    // Verify scene2 state
    const { data: state2 } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const s2 = state2 as { mapUrl: string; tokens: { x: number }[] }
    expect(s2.mapUrl).toBe('/map2.jpg')
    expect(s2.tokens[0].x).toBe(500)
  })

  it('switching scenes preserves each scene tactical data', async () => {
    // Switch back to scene1
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene1Id })
    const { data: state1 } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const s1 = state1 as { mapUrl: string; tokens: { x: number }[] }
    expect(s1.mapUrl).toBe('/map1.jpg')
    expect(s1.tokens[0].x).toBe(100)

    // Switch to scene2
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene2Id })
    const { data: state2 } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const s2 = state2 as { mapUrl: string; tokens: { x: number }[] }
    expect(s2.mapUrl).toBe('/map2.jpg')
    expect(s2.tokens[0].x).toBe(500)
  })

  it('PATCH /tactical updates map/grid fields', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene1Id })

    const { status, data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      grid: { size: 70, visible: false },
      roundNumber: 3,
    })
    expect(status).toBe(200)
    const state = data as {
      grid: { size: number; visible: boolean }
      roundNumber: number
    }
    expect(state.grid.size).toBe(70)
    expect(state.grid.visible).toBe(false)
    expect(state.roundNumber).toBe(3)
  })
})
