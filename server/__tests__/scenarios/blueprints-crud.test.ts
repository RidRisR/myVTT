// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, waitForSocketEvent, type TestContext } from '../helpers/test-server'
import type { Entity, Blueprint } from '../../../src/shared/entityTypes'

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
      tags: ['Humanoid'],
      defaults: {
        components: {
          'core:identity': { name: 'Goblin', imageUrl: '/uploads/goblin.png', color: '#22c55e' },
          'core:token': { width: 1, height: 1 },
        },
      },
    })
    expect(status).toBe(201)
    const bp = data as Blueprint
    bpId = bp.id
    const identity = bp.defaults.components['core:identity'] as Record<string, unknown>
    expect(identity.name).toBe('Goblin')
    expect(identity.imageUrl).toBe('/uploads/goblin.png')
    expect(bp.tags).toEqual(['humanoid'])
    expect(identity.color).toBe('#22c55e')

    const event = await promise
    expect((event as Record<string, unknown>).id).toBe(bpId)
  })

  it('lists blueprints', async () => {
    const { status, data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/blueprints`)
    expect(status).toBe(200)
    const list = data as Blueprint[]
    expect(list).toHaveLength(1)
    const identity = list[0]!.defaults.components['core:identity'] as Record<string, unknown>
    expect(identity.name).toBe('Goblin')
  })

  it('updates a blueprint', async () => {
    const promise = waitForSocketEvent(ctx.socket, 'blueprint:updated')
    const { status, data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/blueprints/${bpId}`, {
      defaults: {
        components: {
          'core:identity': { name: 'Goblin Chief', imageUrl: '/uploads/goblin.png', color: '#ff0000' },
          'core:token': { width: 2, height: 2 },
        },
      },
    })
    expect(status).toBe(200)
    const bp = data as Blueprint
    const identity = bp.defaults.components['core:identity'] as Record<string, unknown>
    expect(identity.name).toBe('Goblin Chief')

    const event = await promise
    const eventBp = event as Blueprint
    const eventIdentity = eventBp.defaults.components['core:identity'] as Record<string, unknown>
    expect(eventIdentity.name).toBe('Goblin Chief')
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
      tags: [],
      defaults: {
        components: {
          'core:identity': { name: 'Skeleton', imageUrl: '/uploads/skeleton.png', color: '#888' },
          'core:token': { width: 1, height: 1 },
        },
      },
    })
    const skeletonBpId = (bpData as Blueprint).id

    // Manually create an entity with blueprint_id
    const { data: entityData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      blueprintId: skeletonBpId,
      components: {
        'core:identity': { name: 'Skeleton 1', imageUrl: '/uploads/skeleton.png', color: '#888' },
        'core:token': { width: 1, height: 1 },
      },
    })
    const entityId = (entityData as Entity).id

    // Delete blueprint
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/blueprints/${skeletonBpId}`)

    // Verify entity still exists but blueprint_id is undefined (SQL NULL → undefined in assembleEntity)
    const { data: fetchedEntity } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities/${entityId}`,
    )
    const entity = fetchedEntity as Entity
    expect(entity.id).toBe(entityId)
    expect(entity.blueprintId).toBeUndefined()
  })
})
