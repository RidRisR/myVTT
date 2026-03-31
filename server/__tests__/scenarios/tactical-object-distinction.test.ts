// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'
import type { Entity } from '../../../src/shared/entityTypes'
import { getName } from '../../../src/shared/coreComponents'

let ctx: TestContext
let sceneId: string

beforeAll(async () => {
  ctx = await setupTestRoom('tactical-object-distinction-test')

  // Setup: create scene + set active
  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Battle Arena',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Tactical Object vs Scene Entity distinction', () => {
  it('quick-create token does NOT create scene_entity_entry', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
      { x: 1, y: 1, name: 'Goblin' },
    )
    expect(status).toBe(201)

    const result = data as {
      entity: { id: string; lifecycle: string }
      token: { id: string; entityId: string }
    }
    expect(result.entity.lifecycle).toBe('tactical')
    expect(result.token.entityId).toBe(result.entity.id)

    // Verify entity is NOT in scene_entities
    const { data: entries } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    const found = (entries as { entityId: string }[]).find((e) => e.entityId === result.entity.id)
    expect(found).toBeUndefined()
  })

  describe('Blueprint spawn with tacticalOnly flag', () => {
    let blueprintId: string

    beforeAll(async () => {
      // Create a blueprint via the blueprints endpoint
      const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/blueprints`, {
        tags: [],
        defaults: {
          components: {
            'core:identity': { name: 'Skeleton', imageUrl: '', color: '#888888' },
            'core:token': { width: 1, height: 1 },
          },
        },
      })
      expect(status).toBe(201)
      blueprintId = (data as { id: string }).id
    })

    it('spawn with tacticalOnly=true does NOT create scene_entity_entry', async () => {
      const { status, data } = await ctx.api(
        'POST',
        `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`,
        { blueprintId, tacticalOnly: true },
      )
      expect(status).toBe(201)

      const result = data as {
        entity: Entity
        sceneEntity: null
      }
      expect(getName(result.entity)).toContain('Skeleton')
      expect(result.sceneEntity).toBeNull()

      // Verify entity is NOT in scene_entities
      const { data: entries } = await ctx.api(
        'GET',
        `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
      )
      const found = (entries as { entityId: string }[]).find((e) => e.entityId === result.entity.id)
      expect(found).toBeUndefined()
    })

    it('spawn without tacticalOnly (default) DOES create scene_entity_entry', async () => {
      const { status, data } = await ctx.api(
        'POST',
        `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`,
        { blueprintId },
      )
      expect(status).toBe(201)

      const result = data as {
        entity: { id: string }
        sceneEntity: { visible: boolean }
      }
      expect(result.sceneEntity).not.toBeNull()
      expect(result.sceneEntity.visible).toBe(true)

      // Verify entity IS in scene_entities
      const { data: entries } = await ctx.api(
        'GET',
        `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
      )
      const found = (entries as { entityId: string }[]).find((e) => e.entityId === result.entity.id)
      expect(found).toBeDefined()
    })
  })

  describe('Unlink ephemeral entity with/without tactical token', () => {
    it('unlink ephemeral entity WITH tactical token keeps entity alive (demotion)', async () => {
      // 1. Create entity
      const entityId = 'e-demote01'
      await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
        id: entityId,
        lifecycle: 'tactical',
        components: {
          'core:identity': { name: 'Demotable NPC', imageUrl: '', color: '#ff0000' },
          'core:token': { width: 1, height: 1 },
        },
      })

      // 2. Link to scene
      await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${entityId}`)

      // 3. Create tactical token for this entity
      await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`, {
        entityId,
        x: 5,
        y: 5,
      })

      // 4. Unlink from scene (demote)
      const { status } = await ctx.api(
        'DELETE',
        `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${entityId}`,
      )
      expect(status).toBe(200)

      // 5. Verify scene_entity_entry is removed
      const { data: entries } = await ctx.api(
        'GET',
        `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
      )
      const found = (entries as { entityId: string }[]).find((e) => e.entityId === entityId)
      expect(found).toBeUndefined()

      // 6. Verify entity still exists (not deleted!)
      const { status: entityStatus } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities`)
      expect(entityStatus).toBe(200)
    })

    it('unlink ephemeral entity WITHOUT tactical token deletes entity', async () => {
      // 1. Create entity
      const entityId = 'e-cleanup1'
      await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
        id: entityId,
        lifecycle: 'tactical',
        components: {
          'core:identity': { name: 'Cleanup NPC', imageUrl: '', color: '#00ff00' },
          'core:token': { width: 1, height: 1 },
        },
      })

      // 2. Link to scene
      await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${entityId}`)

      // 3. Unlink (no tactical token — should delete entity)
      const { status } = await ctx.api(
        'DELETE',
        `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${entityId}`,
      )
      expect(status).toBe(200)

      // 4. Verify entity is deleted
      const { data: allEntities } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities`)
      const found = (allEntities as { id: string }[]).find((e) => e.id === entityId)
      expect(found).toBeUndefined()
    })
  })
})
