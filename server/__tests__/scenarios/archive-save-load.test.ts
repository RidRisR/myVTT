// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext
let sceneId: string
let archiveId: string

beforeAll(async () => {
  ctx = await setupTestRoom('archive-save-load-test')

  // Setup: create scene + set active
  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Battle Chamber',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })

  // Create an archive
  const { data: archive } = await ctx.api(
    'POST',
    `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
    { name: 'Round 1 Snapshot' },
  )
  archiveId = (archive as { id: string }).id
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Archive save', () => {
  it('POST /archives/:archiveId/save returns 200', async () => {
    // Put some tokens on the map first
    const { data: quickResult } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
      { x: 1, y: 2, name: 'Goblin Scout', color: '#22c55e' },
    )
    const ephemeralEntityId = (
      quickResult as { entity: { id: string }; token: { id: string } }
    ).entity.id

    // Create a reusable entity and place it
    const { data: reusableEntity } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/entities`,
      { name: 'Dragon', lifecycle: 'reusable', color: '#ef4444' },
    )
    const reusableEntityId = (reusableEntity as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`, {
      entityId: reusableEntityId,
      x: 5,
      y: 6,
    })

    // Set map URL on tactical state
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      mapUrl: '/maps/dungeon.jpg',
      mapWidth: 2000,
      mapHeight: 1500,
      grid: { size: 60 },
    })

    // Now save
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`,
    )
    expect(status).toBe(200)

    const saved = data as { id: string; name: string; mapUrl: string; grid: { size: number } }
    expect(saved.id).toBe(archiveId)
    expect(saved.mapUrl).toBe('/maps/dungeon.jpg')
    expect(saved.grid.size).toBe(60)
  })

  it('save returns 404 for non-existent archive', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/archives/does-not-exist/save`,
    )
    expect(status).toBe(404)
  })
})

describe('Archive load', () => {
  it('clears current tokens then restores from archive', async () => {
    // First, delete all current tokens by clearing via a fresh quick token
    // (The load should wipe existing tokens and restore archived ones)

    // Add a new token that should NOT survive the load
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/quick`, {
      x: 99,
      y: 99,
      name: 'Doomed Token',
    })

    // Verify we have tokens before load
    const { data: beforeLoad } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    const beforeTokens = (beforeLoad as { tokens: unknown[] }).tokens
    expect(beforeTokens.length).toBeGreaterThan(0)

    // Load the archive
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`,
    )
    expect(status).toBe(200)

    const loaded = data as { tokens: { entityId: string; x: number; y: number }[] }
    expect(loaded.tokens).toHaveLength(2) // goblin + dragon from the save

    // Verify the Doomed Token is gone (it was not in the archive)
    const doomedToken = loaded.tokens.find((t) => t.x === 99 && t.y === 99)
    expect(doomedToken).toBeUndefined()
  })

  it('GET /tactical returns the restored tokens after load', async () => {
    const { status, data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect(status).toBe(200)

    const state = data as {
      mapUrl: string
      grid: { size: number }
      tokens: { entityId: string; x: number; y: number }[]
    }
    expect(state.tokens).toHaveLength(2)
    expect(state.mapUrl).toBe('/maps/dungeon.jpg')
    expect(state.grid.size).toBe(60)
  })

  it('loading archive multiple times is idempotent', async () => {
    // Load a second time
    const { status, data } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`,
    )
    expect(status).toBe(200)

    const loaded = data as { tokens: unknown[] }
    expect(loaded.tokens).toHaveLength(2) // same as before

    // Verify archive itself unchanged
    const { data: archives } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
    )
    const archive = (archives as { id: string; name: string }[]).find((a) => a.id === archiveId)
    expect(archive?.name).toBe('Round 1 Snapshot')
  })

  it('load returns 404 for non-existent archive', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/archives/does-not-exist/load`,
    )
    expect(status).toBe(404)
  })
})
