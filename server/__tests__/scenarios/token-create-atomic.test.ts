// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext
let sceneId: string

beforeAll(async () => {
  ctx = await setupTestRoom('token-create-atomic-test')

  // Setup: create scene + set active
  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Test Arena',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('POST /tactical/tokens/quick — atomic ephemeral entity + token', () => {
  let createdEntityId: string

  it('creates ephemeral entity + token atomically (status 201)', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
      {
        x: 3,
        y: 7,
        name: 'Skeleton',
        color: '#aaaaaa',
      },
    )
    expect(status).toBe(201)

    const result = data as {
      entity: { id: string; name: string; lifecycle: string; color: string }
      token: { id: string; entityId: string; x: number; y: number }
    }

    // Entity assertions
    expect(result.entity.id).toBeTruthy()
    expect(result.entity.name).toBe('Skeleton')
    expect(result.entity.lifecycle).toBe('ephemeral')
    expect(result.entity.color).toBe('#aaaaaa')

    // Token assertions
    expect(result.token.id).toBeTruthy()
    expect(result.token.entityId).toBe(result.entity.id)
    expect(result.token.x).toBe(3)
    expect(result.token.y).toBe(7)

    createdEntityId = result.entity.id
  })

  it('quick-created entity does NOT appear in scene entity entries', async () => {
    const { status, data } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    expect(status).toBe(200)

    const entries = data as { entityId: string; visible: boolean }[]
    const found = entries.find((e) => e.entityId === createdEntityId)
    expect(found).toBeUndefined()
  })
})
