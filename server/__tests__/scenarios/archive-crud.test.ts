// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext
let sceneId: string

beforeAll(async () => {
  ctx = await setupTestRoom('archive-crud-test')

  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Dungeon',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Archive CRUD', () => {
  let archiveId: string
  let archive2Id: string

  it('POST creates archive (no tokens field in response)', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      {
        name: 'Boss Battle',
        mapUrl: '/maps/boss.jpg',
        mapWidth: 2000,
        mapHeight: 1500,
        grid: { size: 50, snap: true },
      },
    )
    expect(status).toBe(201)
    const archive = data as { id: string; name: string; sceneId: string; grid: { size: number } }
    expect(archive.id).toBeTruthy()
    expect(archive.name).toBe('Boss Battle')
    expect(archive.sceneId).toBe(sceneId)
    expect(archive.grid.size).toBe(50)
    // No tokens field
    expect((data as Record<string, unknown>).tokens).toBeUndefined()
    archiveId = archive.id
  })

  it('POST creates a second archive', async () => {
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Ambush' },
    )
    expect(status).toBe(201)
    archive2Id = (data as { id: string }).id
  })

  it('GET returns array for scene', async () => {
    const { status, data } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
    )
    expect(status).toBe(200)
    const list = data as { id: string; name: string }[]
    expect(list).toHaveLength(2)
    const names = list.map((a) => a.name)
    expect(names).toContain('Boss Battle')
    expect(names).toContain('Ambush')
  })

  it('PATCH updates name', async () => {
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/archives/${archiveId}`,
      { name: 'Final Boss' },
    )
    expect(status).toBe(200)
    expect((data as { name: string }).name).toBe('Final Boss')

    // Verify via GET
    const { data: list } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
    )
    const archive = (list as { id: string; name: string }[]).find((a) => a.id === archiveId)
    expect(archive?.name).toBe('Final Boss')
  })

  it('DELETE removes archive', async () => {
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/archives/${archive2Id}`)
    expect(status).toBe(200)

    // Verify it is gone
    const { data: list } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
    )
    expect(list as unknown[]).toHaveLength(1)
    expect((list as { id: string }[])[0]!.id).toBe(archiveId)
  })

  it('archive response uses camelCase', async () => {
    const { data: list } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
    )
    const archive = (list as Record<string, unknown>[])[0]
    expect(archive).toHaveProperty('sceneId')
    expect(archive).toHaveProperty('mapUrl')
    expect(archive).toHaveProperty('mapWidth')
    expect(archive).toHaveProperty('mapHeight')
    expect(archive).toHaveProperty('gmOnly')
    expect(archive).not.toHaveProperty('scene_id')
    expect(archive).not.toHaveProperty('map_url')
    expect(archive).not.toHaveProperty('gm_only')
  })

  it('archives deleted when scene is deleted', async () => {
    // Create a temp scene with an archive
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      id: 'tmp-arc-scene',
      name: 'Temp',
      atmosphere: {},
    })
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/tmp-arc-scene/archives`, {
      name: 'Temp Archive',
    })

    // Delete scene
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/tmp-arc-scene`)

    // Archives for deleted scene should be empty
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/tmp-arc-scene/archives`)
    expect(data).toEqual([])
  })
})
