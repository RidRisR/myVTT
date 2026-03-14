// server/__tests__/scenarios/gm-session.test.ts
// Integration test: complete GM session setup journey
// Tests run sequentially — each depends on prior state.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('GM Session')
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('GM Session Journey', () => {
  let sceneId: string
  let dungeonId: string
  let heroEntityId: string

  it('1.1 creates a GM seat', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/seats`, {
      name: 'GM',
      color: '#ff6600',
      role: 'GM',
    })
    expect(status).toBe(201)
    expect((data as { role: string }).role).toBe('GM')
  })

  it('1.2 creates a scene with specified id', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      id: 'sc-1',
      name: 'Tavern',
      atmosphere: {},
    })
    expect(status).toBe(201)
    const scene = data as { id: string }
    expect(scene.id).toBe('sc-1') // Client-specified ID is preserved
    sceneId = scene.id
  })

  it('1.3 activates the scene', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect((data as { activeSceneId: string }).activeSceneId).toBe(sceneId)
  })

  it('1.4 lists scenes correctly', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes`)
    const scenes = data as Record<string, unknown>[]
    expect(scenes).toHaveLength(1)
    // Contract: camelCase fields, atmosphere is object, gmOnly is boolean
    const scene = scenes[0]
    expect(scene).toHaveProperty('sortOrder')
    expect(scene).not.toHaveProperty('sort_order')
    expect(typeof scene.atmosphere).toBe('object')
    expect(typeof scene.gmOnly).toBe('boolean')
  })

  it('1.5 updates scene atmosphere with deep merge', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/scenes/${sceneId}`, {
      atmosphere: { imageUrl: '/bg/tavern.jpg' },
    })
    // Second update should merge, not overwrite
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/scenes/${sceneId}`, {
      atmosphere: { ambientPreset: 'rain' },
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes`)
    const scenes = data as { id: string; atmosphere: Record<string, unknown> }[]
    const scene = scenes.find((s) => s.id === sceneId)!
    expect(scene.atmosphere.imageUrl).toBe('/bg/tavern.jpg') // Preserved
    expect(scene.atmosphere.ambientPreset).toBe('rain') // Added
  })

  it('1.6 creates persistent entity — auto-links to existing scene', async () => {
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Hero',
      persistent: true,
      color: '#3b82f6',
      size: 1,
      permissions: { default: 'observer', seats: {} },
    })
    expect(status).toBe(201)
    const entity = data as { id: string; persistent: boolean }
    heroEntityId = entity.id
    expect(entity.persistent).toBe(true) // Contract: boolean not 0/1

    // Verify auto-linked to existing scene
    const { data: entityIds } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    expect(entityIds as string[]).toContain(heroEntityId)
  })

  it('1.7 creates second scene — persistent entity auto-links', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Dungeon',
      atmosphere: {},
    })
    dungeonId = (data as { id: string }).id

    // Verify persistent entity auto-linked to new scene
    const { data: entityIds } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${dungeonId}/entities`,
    )
    expect(entityIds as string[]).toContain(heroEntityId)
  })

  it('1.8 deletes scene without affecting active scene', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${dungeonId}`)

    const { data: scenes } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes`)
    expect(scenes as unknown[]).toHaveLength(1)

    const { data: state } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    expect((state as { activeSceneId: string }).activeSceneId).toBe(sceneId) // Unchanged
  })

  it('1.9 entity data has correct contract shape', async () => {
    const { data: entities } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities`)
    const list = entities as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    const entity = list[0]
    // Contract checks
    expect(typeof entity.persistent).toBe('boolean')
    expect(entity).toHaveProperty('permissions')
    expect(typeof entity.permissions).toBe('object')
    expect(entity).not.toHaveProperty('rule_data') // No snake_case leak
  })
})
