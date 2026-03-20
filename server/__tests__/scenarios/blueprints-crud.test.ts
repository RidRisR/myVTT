// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, waitForSocketEvent, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('blueprint-crud-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Blueprint CRUD', () => {
  let bpId: string

  it('creates a blueprint', async () => {
    const promise = waitForSocketEvent(ctx.socket, 'blueprint:created')
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/blueprints`, {
      name: 'Goblin',
      imageUrl: '/uploads/goblin.png',
      defaults: { color: '#22c55e', width: 1, height: 1 },
      tags: ['Humanoid'],
    })
    expect(status).toBe(201)
    const bp = data as Record<string, unknown>
    bpId = bp.id as string
    expect(bp.name).toBe('Goblin')
    expect(bp.imageUrl).toBe('/uploads/goblin.png')
    expect(bp.tags).toEqual(['humanoid'])
    const defaults = bp.defaults as Record<string, unknown>
    expect(defaults.color).toBe('#22c55e')

    const event = await promise
    expect((event as Record<string, unknown>).id).toBe(bpId)
  })

  it('lists blueprints', async () => {
    const { status, data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/blueprints`)
    expect(status).toBe(200)
    const list = data as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]!.name).toBe('Goblin')
  })

  it('updates a blueprint', async () => {
    const promise = waitForSocketEvent(ctx.socket, 'blueprint:updated')
    const { status, data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/blueprints/${bpId}`, {
      name: 'Goblin Chief',
      defaults: { color: '#ff0000', width: 2, height: 2 },
    })
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).name).toBe('Goblin Chief')

    const event = await promise
    expect((event as Record<string, unknown>).name).toBe('Goblin Chief')
  })

  it('returns 404 for non-existent blueprint', async () => {
    const { status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/blueprints/nonexistent`, {
      name: 'nope',
    })
    expect(status).toBe(404)
  })

  it('deletes a blueprint', async () => {
    const promise = waitForSocketEvent(ctx.socket, 'blueprint:deleted')
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/blueprints/${bpId}`)
    expect(status).toBe(204)

    const event = await promise
    expect((event as Record<string, unknown>).id).toBe(bpId)

    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/blueprints`)
    expect(data as unknown[]).toHaveLength(0)
  })

  it('ON DELETE SET NULL — entity.blueprint_id nulled when blueprint deleted', async () => {
    // Create blueprint
    const { data: bpData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/blueprints`, {
      name: 'Skeleton',
      imageUrl: '/uploads/skeleton.png',
      defaults: { color: '#888', width: 1, height: 1 },
    })
    const skeletonBpId = (bpData as Record<string, unknown>).id as string

    // Create a scene, then spawn from blueprint — but spawn still reads assets table (Task 4 fixes this)
    // So instead, manually create an entity with blueprint_id
    const { data: entityData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Skeleton 1',
      imageUrl: '/uploads/skeleton.png',
      color: '#888',
      width: 1,
      height: 1,
      blueprintId: skeletonBpId,
    })
    const entityId = (entityData as Record<string, unknown>).id as string

    // Delete blueprint
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/blueprints/${skeletonBpId}`)

    // Verify entity still exists but blueprint_id is null
    const { data: fetchedEntity } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities/${entityId}`,
    )
    const entity = fetchedEntity as Record<string, unknown>
    expect(entity.id).toBe(entityId)
    expect(entity.blueprintId).toBeNull()
  })
})
