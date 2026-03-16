// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext
let sceneId: string

beforeAll(async () => {
  ctx = await setupTestRoom('archive-error-cases-test')

  // Create scene (but do NOT set active scene yet — some tests need no active scene)
  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Archive Error Scene',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Archive 404 error cases', () => {
  it('PATCH /archives/nonexistent returns 404', async () => {
    const { status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/archives/nonexistent`, {
      name: 'Nope',
    })
    expect(status).toBe(404)
  })

  it('POST /archives/nonexistent/save returns 404 (archive not found)', async () => {
    // Need active scene for save to get past the scene check
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })

    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/nonexistent/save`)
    expect(status).toBe(404)
  })

  it('POST /archives/nonexistent/load returns 404 (archive not found)', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/nonexistent/load`)
    expect(status).toBe(404)
  })

  it('POST /archives/:id/save with no active scene returns 404', async () => {
    // Create a real archive first
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Save Test Archive' },
    )
    const archiveId = (archive as { id: string }).id

    // Clear active scene
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: null })

    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)
    expect(status).toBe(404)

    // Restore active scene for subsequent tests
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
  })

  it('POST /archives/:id/load with no active scene returns 404', async () => {
    // Create a real archive
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Load Test Archive' },
    )
    const archiveId = (archive as { id: string }).id

    // Clear active scene
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: null })

    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`)
    expect(status).toBe(404)

    // Restore active scene for subsequent tests
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
  })
})

describe('Archive gmOnly filtering', () => {
  let gmOnlyArchiveId: string

  beforeAll(async () => {
    // Create a gmOnly archive
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'GM Secret Archive', gmOnly: true },
    )
    gmOnlyArchiveId = (archive as { id: string }).id
  })

  it('GET archives without role header does NOT include gmOnly archive', async () => {
    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`)
    const data = (await res.json()) as { id: string; gmOnly: boolean }[]
    const found = data.find((a) => a.id === gmOnlyArchiveId)
    expect(found).toBeUndefined()
  })

  it('GET archives with x-myvtt-role: GM header DOES include gmOnly archive', async () => {
    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`, {
      headers: { 'x-myvtt-role': 'GM' },
    })
    const data = (await res.json()) as { id: string; gmOnly: boolean }[]
    const found = data.find((a) => a.id === gmOnlyArchiveId)
    expect(found).toBeDefined()
    expect(found!.gmOnly).toBe(true)
  })

  it('GET archives with x-myvtt-role: PL header does NOT include gmOnly archive', async () => {
    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`, {
      headers: { 'x-myvtt-role': 'PL' },
    })
    const data = (await res.json()) as { id: string; gmOnly: boolean }[]
    const found = data.find((a) => a.id === gmOnlyArchiveId)
    expect(found).toBeUndefined()
  })
})

describe('Archive load when reusable entity deleted', () => {
  it('load skips tokens whose reusable entity was deleted', async () => {
    // Ensure active scene
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })

    // Create a reusable entity + place as token
    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Fragile Dragon',
      lifecycle: 'reusable',
      color: '#ef4444',
    })
    const reusableEntityId = (entity as { id: string }).id

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`, {
      entityId: reusableEntityId,
      x: 50,
      y: 60,
    })

    // Create archive and save
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Fragile Dragon Archive' },
    )
    const archiveId = (archive as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)

    // Delete the reusable entity
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/entities/${reusableEntityId}`)

    // Load archive — should succeed, but token for deleted entity is skipped
    const { status, data: loaded } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`,
    )
    expect(status).toBe(200)

    // Verify no token references the deleted entity
    const tokens = (loaded as { tokens: { entityId: string }[] }).tokens
    const found = tokens.find((t) => t.entityId === reusableEntityId)
    expect(found).toBeUndefined()
  })
})
