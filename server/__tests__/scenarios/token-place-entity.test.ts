// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext
let sceneId: string
let entityId: string

beforeAll(async () => {
  ctx = await setupTestRoom('token-place-entity-test')

  // Setup: create scene + entity + set active
  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Forest Clearing',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })

  const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
    name: 'Paladin',
    lifecycle: 'persistent',
    color: '#f59e0b',
  })
  entityId = (entity as { id: string }).id
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('POST /tactical/tokens/from-entity — place existing entity on map', () => {
  it('places entity on map (status 201)', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`,
      {
        entityId,
        x: 10,
        y: 20,
      },
    )
    expect(status).toBe(201)

    const token = data as { id: string; entityId: string; x: number; y: number }
    expect(token.id).toBeTruthy()
    expect(token.entityId).toBe(entityId)
    expect(token.x).toBe(10)
    expect(token.y).toBe(20)
  })

  it('entity count unchanged — no new entity created', async () => {
    const { status, data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities`)
    expect(status).toBe(200)

    const entities = data as { id: string }[]
    // Only the one we created in beforeAll
    expect(entities).toHaveLength(1)
    expect(entities[0].id).toBe(entityId)
  })

  it('returns 409 if same entity already has a token in this scene', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`,
      {
        entityId,
        x: 50,
        y: 60,
      },
    )
    expect(status).toBe(409)
  })
})
