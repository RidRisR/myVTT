// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'
import type { Entity } from '../../../src/shared/entityTypes'
import { getName, getColor } from '../../../src/shared/coreComponents'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('spawn-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Spawn from Blueprint Journey', () => {
  let sceneId: string, blueprintId: string

  it('creates a scene', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Tavern',
      atmosphere: {},
    })
    sceneId = (data as { id: string }).id
  })

  it('creates a blueprint', async () => {
    const { data, status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/blueprints`, {
      tags: [],
      defaults: {
        components: {
          'core:identity': { name: '哥布林', imageUrl: '/uploads/goblin.png', color: '#22c55e' },
          'core:token': { width: 1, height: 1 },
        },
      },
    })
    expect(status).toBe(201)
    blueprintId = (data as { id: string }).id
  })

  it('spawns entity from blueprint', async () => {
    const { data, status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`,
      { blueprintId },
    )
    expect(status).toBe(201)
    const result = data as {
      entity: Entity
      sceneEntity: { visible: boolean }
    }
    expect(getName(result.entity)).toBe('\u54E5\u5E03\u6797 1')
    expect(result.entity.lifecycle).toBe('tactical')
    expect(getColor(result.entity)).toBe('#22c55e')
    expect(result.sceneEntity.visible).toBe(true)
  })

  it('spawns second entity with incremented name', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`, {
      blueprintId,
    })
    const result = data as { entity: Entity }
    expect(getName(result.entity)).toBe('\u54E5\u5E03\u6797 2')
  })

  it('spawned entity appears in scene entity list', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`)
    const entries = data as { entityId: string; visible: boolean }[]
    expect(entries.length).toBeGreaterThanOrEqual(2)
    expect(entries.every((e) => e.visible)).toBe(true)
  })

  it('rejects spawn with invalid blueprint', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`, {
      blueprintId: 'nonexistent',
    })
    expect(status).toBe(404)
  })
})
