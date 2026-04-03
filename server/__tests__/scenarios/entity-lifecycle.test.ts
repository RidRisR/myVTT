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
  let tacticalId: string, persistentId: string

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

  it('creates tactical entity', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'tactical',
      components: {
        'core:identity': { name: 'Goblin', imageUrl: '', color: '#888' },
      },
    })
    tacticalId = (data as { id: string; lifecycle: string }).id
    expect((data as { lifecycle: string }).lifecycle).toBe('tactical')
  })

  it('creates persistent entity — does NOT auto-link to scenes', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'persistent',
      components: {
        'core:identity': { name: 'Hero', imageUrl: '', color: '#888' },
      },
    })
    persistentId = (data as { id: string }).id

    const { data: aEnts } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`,
    )
    const ids = (aEnts as { entityId: string }[]).map((r) => r.entityId)
    expect(ids).not.toContain(persistentId)
  })

  it('links tactical to scene A', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tacticalId}`)
  })

  it('rejects tactical entity in second scene', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities/${tacticalId}`,
    )
    expect(status).toBe(400)
  })

  it('visible defaults to true on link', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`)
    const entry = (data as { entityId: string; visible: boolean }[]).find(
      (r) => r.entityId === tacticalId,
    )
    expect(entry?.visible).toBe(true)
  })

  it('toggles visible to false (backstage)', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tacticalId}`, {
      visible: false,
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`)
    const entry = (data as { entityId: string; visible: boolean }[]).find(
      (r) => r.entityId === tacticalId,
    )
    expect(entry?.visible).toBe(false)
  })

  it('promotes tactical to persistent', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/entities/${tacticalId}`, {
      lifecycle: 'persistent',
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${tacticalId}`)
    expect((data as { lifecycle: string }).lifecycle).toBe('persistent')
  })

  it('unlinks persistent from scene — entity preserved', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tacticalId}`)
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${tacticalId}`)
    expect(status).toBe(200)
  })

  it('creates tactical and unlinks — entity deleted', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'tactical',
      components: {
        'core:identity': { name: 'Temp NPC', imageUrl: '', color: '#888' },
      },
    })
    const tempId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tempId}`)
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tempId}`)
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${tempId}`)
    expect(status).toBe(404)
  })

  it('new scene does NOT auto-link persistent entities', async () => {
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
    expect(ids).not.toContain(persistentId)
  })

  it('deleting scene cleans up tactical entities', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'tactical',
      components: {
        'core:identity': { name: 'Scene Goblin', imageUrl: '', color: '#888' },
      },
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

  it('deleting scene cleans up scene-scoped entities', async () => {
    const { data: sceneData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene D',
      atmosphere: {},
    })
    const sceneDId = (sceneData as { id: string }).id

    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'scene',
      components: {
        'core:identity': { name: 'Scene NPC', imageUrl: '', color: '#888' },
      },
    })
    const sceneNpcId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneDId}/entities/${sceneNpcId}`)
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneDId}`)
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${sceneNpcId}`)
    expect(status).toBe(404)
  })

  it('scene-scoped entity has single-scene constraint', async () => {
    const { data: sceneData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene E',
      atmosphere: {},
    })
    const sceneEId = (sceneData as { id: string }).id

    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'scene',
      components: {
        'core:identity': { name: 'Scene Guard', imageUrl: '', color: '#888' },
      },
    })
    const guardId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneEId}/entities/${guardId}`)

    const { data: sceneData2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene F',
      atmosphere: {},
    })
    const sceneFId = (sceneData2 as { id: string }).id
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneFId}/entities/${guardId}`,
    )
    expect(status).toBe(400)
  })
})
