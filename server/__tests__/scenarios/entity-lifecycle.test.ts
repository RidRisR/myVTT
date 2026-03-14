// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('entity-lifecycle-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Entity Lifecycle Journey', () => {
  let sceneAId: string, sceneBId: string
  let ephemeralId: string, reusableId: string, persistentId: string

  it('creates two scenes', async () => {
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

  it('creates ephemeral entity', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Goblin',
      lifecycle: 'ephemeral',
    })
    ephemeralId = (data as { id: string; lifecycle: string }).id
    expect((data as { lifecycle: string }).lifecycle).toBe('ephemeral')
  })

  it('creates reusable entity', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Merchant',
      lifecycle: 'reusable',
    })
    reusableId = (data as { id: string }).id
    expect((data as { lifecycle: string }).lifecycle).toBe('reusable')
  })

  it('creates persistent entity — auto-links to all scenes', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Hero',
      lifecycle: 'persistent',
    })
    persistentId = (data as { id: string }).id

    const { data: aEnts } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`,
    )
    const ids = (aEnts as { entityId: string }[]).map((r) => r.entityId)
    expect(ids).toContain(persistentId)
  })

  it('links ephemeral to scene A', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${ephemeralId}`)
  })

  it('rejects ephemeral in second scene', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities/${ephemeralId}`,
    )
    expect(status).toBe(400)
  })

  it('visible defaults to true on link', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`)
    const entry = (data as { entityId: string; visible: boolean }[]).find(
      (r) => r.entityId === ephemeralId,
    )
    expect(entry?.visible).toBe(true)
  })

  it('toggles visible to false (backstage)', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${ephemeralId}`, {
      visible: false,
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`)
    const entry = (data as { entityId: string; visible: boolean }[]).find(
      (r) => r.entityId === ephemeralId,
    )
    expect(entry?.visible).toBe(false)
  })

  it('promotes ephemeral to reusable', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/entities/${ephemeralId}`, {
      lifecycle: 'reusable',
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${ephemeralId}`)
    expect((data as { lifecycle: string }).lifecycle).toBe('reusable')
  })

  it('unlinks reusable from scene — entity preserved', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${ephemeralId}`)
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${ephemeralId}`)
    expect(status).toBe(200)
  })

  it('creates new ephemeral and unlinks — entity deleted', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Temp NPC',
      lifecycle: 'ephemeral',
    })
    const tempId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tempId}`)
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tempId}`)
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${tempId}`)
    expect(status).toBe(404)
  })

  it('new scene auto-links persistent entities', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene C',
      atmosphere: {},
    })
    const sceneCId = (data as { id: string }).id
    const { data: ents } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneCId}/entities`,
    )
    const ids = (ents as { entityId: string }[]).map((r) => r.entityId)
    expect(ids).toContain(persistentId)
    expect(ids).not.toContain(reusableId)
  })

  it('deleting scene cleans up ephemeral entities', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Scene Goblin',
      lifecycle: 'ephemeral',
    })
    const sceneGoblinId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${sceneGoblinId}`)
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}`)
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${sceneGoblinId}`)
    expect(status).toBe(404)
    const { status: heroStatus } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities/${persistentId}`,
    )
    expect(heroStatus).toBe(200)
  })
})
