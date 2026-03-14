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

  it('4.2 creates non-persistent entity', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Goblin',
      persistent: false,
      color: '#22c55e',
      size: 1,
      permissions: { default: 'observer', seats: {} },
    })
    goblinId = (data as { id: string }).id
  })

  it('4.3 manually links goblin to scene A', async () => {
    await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${goblinId}`,
    )
    const { data } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`,
    )
    expect(data as string[]).toContain(goblinId)
  })

  it('4.4 goblin is NOT in scene B (non-persistent)', async () => {
    const { data } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`,
    )
    expect(data as string[]).not.toContain(goblinId)
  })

  it('4.5 creates persistent entity — auto-links to both scenes', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Hero',
      persistent: true,
      color: '#3b82f6',
      size: 1,
      permissions: { default: 'observer', seats: {} },
    })
    heroId = (data as { id: string }).id

    const { data: aEntities } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`,
    )
    expect(aEntities as string[]).toContain(heroId)

    const { data: bEntities } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`,
    )
    expect(bEntities as string[]).toContain(heroId)
  })

  it('4.6 new scene auto-links persistent entities', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene C',
      atmosphere: {},
    })
    sceneCId = (data as { id: string }).id

    const { data: entities } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneCId}/entities`,
    )
    expect(entities as string[]).toContain(heroId)
    expect(entities as string[]).not.toContain(goblinId) // Non-persistent not auto-linked
  })

  it('4.7 unlinks goblin from scene A', async () => {
    await ctx.api(
      'DELETE',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${goblinId}`,
    )
    const { data } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`,
    )
    expect(data as string[]).not.toContain(goblinId)
  })

  it('4.8 deleting entity removes all scene links', async () => {
    // Re-link goblin to scene B first so we can verify cascade
    await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities/${goblinId}`,
    )
    const { data: before } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`,
    )
    expect(before as string[]).toContain(goblinId)

    // Delete the entity
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/entities/${goblinId}`)

    // Entity gone from global list
    const { data: entities } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities`)
    expect((entities as { id: string }[]).find((e) => e.id === goblinId)).toBeUndefined()

    // Cascade: link removed from scene B
    const { data: after } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`,
    )
    expect(after as string[]).not.toContain(goblinId)
  })

  it('4.9 hero still linked to all scenes after goblin deletion', async () => {
    const { data: a } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`,
    )
    const { data: b } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`,
    )
    const { data: c } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneCId}/entities`,
    )
    expect(a as string[]).toContain(heroId)
    expect(b as string[]).toContain(heroId)
    expect(c as string[]).toContain(heroId)
  })

  it('4.10 deleting scene A does not affect hero in other scenes', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}`)
    const { data: b } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities`,
    )
    expect(b as string[]).toContain(heroId)
  })
})
