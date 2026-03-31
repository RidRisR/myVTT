// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('scene-entity-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Scene-Entity Relationships Journey', () => {
  let sceneAId: string, sceneBId: string, sceneCId: string
  let goblinId: string, heroId: string

  it('4.1 creates two scenes', async () => {
    const { data: a } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene A',
      atmosphere: {},
    })
    sceneAId = (a as { id: string }).id
    const { data: b } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene B',
      atmosphere: {},
    })
    sceneBId = (b as { id: string }).id
  })

  it('4.2 creates ephemeral entity', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Goblin',
      lifecycle: 'tactical',
      color: '#22c55e',
      size: 1,
      permissions: { default: 'observer', seats: {} },
    })
    goblinId = (data as { id: string }).id
  })

  it('4.3 manually links goblin to scene A', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${goblinId}`)
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`)
    const ids = (data as { entityId: string; visible: boolean }[]).map((r) => r.entityId)
    expect(ids).toContain(goblinId)
  })

  it('4.4 goblin is NOT in scene B (ephemeral)', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`)
    const ids = (data as { entityId: string; visible: boolean }[]).map((r) => r.entityId)
    expect(ids).not.toContain(goblinId)
  })

  it('4.5 creates persistent entity — manually links to both scenes', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Hero',
      lifecycle: 'persistent',
      color: '#3b82f6',
      size: 1,
      permissions: { default: 'observer', seats: {} },
    })
    heroId = (data as { id: string }).id

    // Persistent entities are NOT auto-linked — verify first
    const { data: aBeforeLink } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`,
    )
    expect(
      (aBeforeLink as { entityId: string; visible: boolean }[]).map((r) => r.entityId),
    ).not.toContain(heroId)

    // Manually link to both scenes
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${heroId}`)
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities/${heroId}`)

    const { data: aEntities } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`,
    )
    expect(
      (aEntities as { entityId: string; visible: boolean }[]).map((r) => r.entityId),
    ).toContain(heroId)

    const { data: bEntities } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`,
    )
    expect(
      (bEntities as { entityId: string; visible: boolean }[]).map((r) => r.entityId),
    ).toContain(heroId)
  })

  it('4.6 new scene does NOT auto-link persistent entities', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene C',
      atmosphere: {},
    })
    sceneCId = (data as { id: string }).id

    const { data: entities } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneCId}/entities`,
    )
    const ids = (entities as { entityId: string; visible: boolean }[]).map((r) => r.entityId)
    expect(ids).not.toContain(heroId)
    expect(ids).not.toContain(goblinId)

    // Manually link hero for downstream tests
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneCId}/entities/${heroId}`)
  })

  it('4.7 unlinks goblin from scene A — ephemeral entity is deleted', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${goblinId}`)
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`)
    const ids = (data as { entityId: string; visible: boolean }[]).map((r) => r.entityId)
    expect(ids).not.toContain(goblinId)

    // Ephemeral entity should be deleted from global store
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${goblinId}`)
    expect(status).toBe(404)
  })

  it('4.8 deleting entity removes all scene links', async () => {
    // Create a new reusable entity for this test
    const { data: newEntity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Orc',
      lifecycle: 'persistent',
      color: '#ef4444',
      size: 1,
    })
    const orcId = (newEntity as { id: string }).id

    // Link to scene B
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities/${orcId}`)
    const { data: before } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`,
    )
    expect((before as { entityId: string; visible: boolean }[]).map((r) => r.entityId)).toContain(
      orcId,
    )

    // Delete the entity
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/entities/${orcId}`)

    // Entity gone from global list
    const { data: entities } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities`)
    expect((entities as { id: string }[]).find((e) => e.id === orcId)).toBeUndefined()

    // Cascade: link removed from scene B
    const { data: after } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`,
    )
    expect(
      (after as { entityId: string; visible: boolean }[]).map((r) => r.entityId),
    ).not.toContain(orcId)
  })

  it('4.9 hero still linked to all scenes after entity deletion', async () => {
    const { data: b } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`)
    const { data: c } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneCId}/entities`)
    expect((b as { entityId: string; visible: boolean }[]).map((r) => r.entityId)).toContain(heroId)
    expect((c as { entityId: string; visible: boolean }[]).map((r) => r.entityId)).toContain(heroId)
  })

  it('4.10 deleting scene A does not affect hero in other scenes', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}`)
    const { data: b } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`)
    expect((b as { entityId: string; visible: boolean }[]).map((r) => r.entityId)).toContain(heroId)
  })
})
