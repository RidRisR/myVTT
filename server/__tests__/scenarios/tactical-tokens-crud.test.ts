// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext
let sceneId: string
let entityId: string

beforeAll(async () => {
  ctx = await setupTestRoom('tactical-tokens-crud-test')

  // Setup: create scene + entity + set active
  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Battlefield',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })

  const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
    name: 'Fighter',
    lifecycle: 'reusable',
    color: '#ef4444',
  })
  entityId = (entity as { id: string }).id
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Tactical Tokens CRUD', () => {
  let quickTokenId: string
  let quickEntityId: string
  let tokenId: string
  let fromEntityTokenId: string

  it('POST /tactical/tokens/quick creates entity + token atomically', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
      {
        x: 5,
        y: 10,
        name: 'Goblin',
        color: '#22c55e',
      },
    )
    expect(status).toBe(201)
    const result = data as {
      entity: { id: string; name: string; lifecycle: string }
      token: { id: string; entityId: string; x: number; y: number }
    }
    expect(result.entity.name).toBe('Goblin')
    expect(result.entity.lifecycle).toBe('ephemeral')
    expect(result.token.entityId).toBe(result.entity.id)
    expect(result.token.x).toBe(5)
    expect(result.token.y).toBe(10)
    quickTokenId = result.token.id
    quickEntityId = result.entity.id
  })

  it('POST /tactical/tokens creates token for existing entity', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens`,
      {
        entityId,
        x: 100,
        y: 200,
        width: 2,
        height: 2,
      },
    )
    expect(status).toBe(201)
    const token = data as { id: string; entityId: string; width: number; height: number }
    expect(token.entityId).toBe(entityId)
    expect(token.width).toBe(2)
    expect(token.height).toBe(2)
    tokenId = token.id
  })

  it('POST /tactical/tokens/from-entity places entity on map', async () => {
    // Create a second entity for from-entity test
    const { data: e2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Mage',
      lifecycle: 'reusable',
    })
    const e2Id = (e2 as { id: string }).id

    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`,
      {
        entityId: e2Id,
        x: 50,
        y: 60,
      },
    )
    expect(status).toBe(201)
    const token = data as { id: string; entityId: string }
    expect(token.entityId).toBe(e2Id)
    fromEntityTokenId = token.id
  })

  it('POST /tactical/tokens/from-entity returns 409 if already has token in scene', async () => {
    // entityId already has a token from the earlier test
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`,
      {
        entityId,
        x: 300,
        y: 400,
      },
    )
    expect(status).toBe(409)
  })

  it('PATCH /tactical/tokens/:id updates position', async () => {
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/tactical/tokens/${tokenId}`,
      { x: 150, y: 250 },
    )
    expect(status).toBe(200)
    const token = data as { x: number; y: number }
    expect(token.x).toBe(150)
    expect(token.y).toBe(250)
  })

  it('DELETE /tactical/tokens/:id removes token', async () => {
    const { status, data } = await ctx.api(
      'DELETE',
      `/api/rooms/${ctx.roomId}/tactical/tokens/${quickTokenId}`,
    )
    expect(status).toBe(200)
    expect((data as { id: string }).id).toBe(quickTokenId)
  })

  it('GET /tactical returns tokens array', async () => {
    const { status, data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect(status).toBe(200)
    const state = data as { tokens: { id: string }[] }
    // quickToken was deleted, should have tokenId + fromEntityTokenId remaining
    const ids = state.tokens.map((t) => t.id)
    expect(ids).toContain(tokenId)
    expect(ids).toContain(fromEntityTokenId)
    expect(ids).not.toContain(quickTokenId)
  })

  it('DELETE /tactical/tokens/:id returns 404 for non-existent token', async () => {
    const { status } = await ctx.api(
      'DELETE',
      `/api/rooms/${ctx.roomId}/tactical/tokens/does-not-exist`,
    )
    expect(status).toBe(404)
  })

  it('POST /tactical/tokens returns 409 if entity already has a token in scene', async () => {
    // entityId already has tokenId from the earlier test
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens`, {
      entityId,
      x: 999,
      y: 999,
    })
    expect(status).toBe(409)
  })

  it('deleting a token does NOT auto-delete the ephemeral entity', async () => {
    // quick-create gives us an entity + token
    const { data: created } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
      { x: 0, y: 0, name: 'Orphan' },
    )
    const { entity, token } = created as { entity: { id: string }; token: { id: string } }

    // delete the token
    const { status: delStatus } = await ctx.api(
      'DELETE',
      `/api/rooms/${ctx.roomId}/tactical/tokens/${token.id}`,
    )
    expect(delStatus).toBe(200)

    // entity should still exist
    const { status: entityStatus } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities/${entity.id}`,
    )
    expect(entityStatus).toBe(200)
  })
})

describe('PATCH /tactical state-level update', () => {
  let patchSceneId: string

  it('setup: create a fresh scene and set it active', async () => {
    const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Patch Test Scene',
      atmosphere: {},
    })
    patchSceneId = (scene as { id: string }).id
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: patchSceneId })
  })

  it('PATCH /tactical sets mapUrl, roundNumber, and grid.size', async () => {
    const { status, data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      mapUrl: '/map.jpg',
      roundNumber: 3,
      grid: { size: 70 },
    })
    expect(status).toBe(200)
    const state = data as { mapUrl: string; roundNumber: number; grid: { size: number } }
    expect(state.mapUrl).toBe('/map.jpg')
    expect(state.roundNumber).toBe(3)
    expect(state.grid.size).toBe(70)
  })

  it('second PATCH with only grid.snap preserves grid.size (deep merge)', async () => {
    const { status, data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      grid: { snap: false },
    })
    expect(status).toBe(200)
    const state = data as { grid: { size: number; snap: boolean } }
    // size from first patch must survive
    expect(state.grid.size).toBe(70)
    // new field was written
    expect(state.grid.snap).toBe(false)
  })
})
