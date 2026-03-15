// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestRoom,
  connectSecondClient,
  waitForSocketEvent,
  type TestContext,
} from '../helpers/test-server'

let ctx: TestContext
let sceneId: string
let entityId: string
let tokenId: string

beforeAll(async () => {
  ctx = await setupTestRoom('tactical-token-duplicate-test')

  // Setup: scene + entity + active scene + token
  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Duplicate Arena',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })

  const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
    name: 'Warrior',
    lifecycle: 'reusable',
    color: '#ef4444',
    width: 1,
    height: 1,
    permissions: { default: 'observer', seats: {} },
  })
  entityId = (entity as { id: string }).id

  const { data: token } = await ctx.api(
    'POST',
    `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`,
    {
      entityId,
      x: 10,
      y: 20,
    },
  )
  tokenId = (token as { id: string }).id
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Tactical Token Duplicate', () => {
  let duplicatedEntityId: string
  let duplicatedTokenId: string

  it('happy path: POST duplicate returns 201 with { entity, token }', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/${tokenId}/duplicate`,
      { offsetX: 2, offsetY: 3 },
    )
    expect(status).toBe(201)

    const result = data as {
      entity: { id: string; name: string }
      token: { id: string; entityId: string }
    }
    expect(result.entity).toBeDefined()
    expect(result.token).toBeDefined()
    expect(result.entity.id).not.toBe(entityId)
    expect(result.token.id).not.toBe(tokenId)
    expect(result.token.entityId).toBe(result.entity.id)

    duplicatedEntityId = result.entity.id
    duplicatedTokenId = result.token.id
  })

  it('copied entity has lifecycle = ephemeral (even if original was reusable)', async () => {
    const { data: entity } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities/${duplicatedEntityId}`,
    )
    expect((entity as { lifecycle: string }).lifecycle).toBe('ephemeral')
  })

  it('offset position: new token position = original + offset', async () => {
    const { data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/${tokenId}/duplicate`,
      { offsetX: 5, offsetY: 7 },
    )
    const result = data as { token: { x: number; y: number } }
    expect(result.token.x).toBe(10 + 5) // original x=10
    expect(result.token.y).toBe(20 + 7) // original y=20
  })

  it('default offset: empty body uses offsetX=1, offsetY=1', async () => {
    const { data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/${tokenId}/duplicate`,
      {},
    )
    const result = data as { token: { x: number; y: number } }
    expect(result.token.x).toBe(10 + 1) // original x=10, default offset=1
    expect(result.token.y).toBe(20 + 1) // original y=20, default offset=1
  })

  it('entity count increases after duplicate', async () => {
    const { data: beforeEntities } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities`,
    )
    const countBefore = (beforeEntities as unknown[]).length

    await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/${tokenId}/duplicate`,
      { offsetX: 3, offsetY: 3 },
    )

    const { data: afterEntities } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities`,
    )
    const countAfter = (afterEntities as unknown[]).length
    expect(countAfter).toBe(countBefore + 1)
  })

  it('returns 404 when token not found', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/nonexistent-token-id/duplicate`,
      {},
    )
    expect(status).toBe(404)
  })

  it('broadcasts tactical:token:added and entity:created to other clients', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    const tokenAddedPromise = waitForSocketEvent<{ id: string; entityId: string }>(
      socket2,
      'tactical:token:added',
    )
    const entityCreatedPromise = waitForSocketEvent<{ id: string; lifecycle: string }>(
      socket2,
      'entity:created',
    )

    const { data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/${tokenId}/duplicate`,
      { offsetX: 1, offsetY: 0 },
    )
    const result = data as { entity: { id: string }; token: { id: string } }

    const [tokenEvent, entityEvent] = await Promise.all([
      tokenAddedPromise,
      entityCreatedPromise,
    ])

    expect(tokenEvent.id).toBe(result.token.id)
    expect(entityEvent.id).toBe(result.entity.id)
    expect(entityEvent.lifecycle).toBe('ephemeral')

    socket2.disconnect()
  })
})
