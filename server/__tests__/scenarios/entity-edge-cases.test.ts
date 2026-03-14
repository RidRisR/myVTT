// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('entity-edge-cases-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Entity Edge Cases', () => {
  let sceneId: string

  it('creates a scene', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Test Scene',
      atmosphere: {},
    })
    sceneId = (data as { id: string }).id
  })

  it('default lifecycle is ephemeral when not specified', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Default Entity',
    })
    expect((data as { lifecycle: string }).lifecycle).toBe('ephemeral')
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/entities/${(data as { id: string }).id}`)
  })

  it('rejects invalid lifecycle value', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Bad Entity',
      lifecycle: 'invalid',
    })
    expect(status).toBeGreaterThanOrEqual(400)
  })

  it('ephemeral re-link to same scene is idempotent', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Goblin',
      lifecycle: 'ephemeral',
    })
    const id = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`)
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`,
    )
    expect(status).toBeLessThan(400)
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`)
  })

  it('promoting ephemeral to reusable allows multi-scene', async () => {
    const { data: scene2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene 2',
      atmosphere: {},
    })
    const scene2Id = (scene2 as { id: string }).id

    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Important NPC',
      lifecycle: 'ephemeral',
    })
    const id = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`)

    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/entities/${id}`, {
      lifecycle: 'reusable',
    })

    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${scene2Id}/entities/${id}`,
    )
    expect(status).toBeLessThan(400)

    const { data: ents1 } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    const { data: ents2 } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${scene2Id}/entities`,
    )
    expect((ents1 as { entityId: string }[]).map((e) => e.entityId)).toContain(id)
    expect((ents2 as { entityId: string }[]).map((e) => e.entityId)).toContain(id)
  })

  it('link with visible=false creates backstage entry', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Assassin',
      lifecycle: 'reusable',
    })
    const id = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`, {
      visible: 0,
    })
    const { data: ents } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    const entry = (ents as { entityId: string; visible: boolean }[]).find((e) => e.entityId === id)
    expect(entry?.visible).toBe(false)
  })

  it('PATCH visible on non-existent link returns 404', async () => {
    const { status } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/nonexistent`,
      { visible: true },
    )
    expect(status).toBe(404)
  })

  it('deleting non-existent entity returns 404', async () => {
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/entities/nonexistent`)
    expect(status).toBe(404)
  })

  it('persistent entity removed from scene can be re-added', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Companion',
      lifecycle: 'persistent',
    })
    const id = (data as { id: string }).id
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`)
    const { data: ents1 } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    expect((ents1 as { entityId: string }[]).map((e) => e.entityId)).not.toContain(id)
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`)
    const { data: ents2 } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    expect((ents2 as { entityId: string }[]).map((e) => e.entityId)).toContain(id)
  })
})
