// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('schema-field-ownership')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Schema Field Ownership', () => {
  let sceneA: string
  let sceneB: string

  it('setup: create two scenes', async () => {
    const { data: a } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene A',
      atmosphere: {},
    })
    sceneA = (a as { id: string }).id
    const { data: b } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene B',
      atmosphere: {},
    })
    sceneB = (b as { id: string }).id
  })

  it('scene switch preserves per-scene tacticalMode', async () => {
    // Activate scene A, enter tactical
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneA })
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)

    // Switch to scene B — should have tacticalMode=0
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneB })
    const { data: tacticalB } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tacticalB as { tacticalMode: number }).tacticalMode).toBe(0)

    // Switch back to A — should still be tacticalMode=1
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneA })
    const { data: tacticalA } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tacticalA as { tacticalMode: number }).tacticalMode).toBe(1)
  })

  it('scene switch preserves per-scene activeArchiveId', async () => {
    // Create archive on scene A, load it
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneA })
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneA}/archives`,
      { name: 'Archive 1' },
    )
    const archiveId = (archive as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`)

    // Verify A has the archive active
    const { data: tA1 } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tA1 as { activeArchiveId: string | null }).activeArchiveId).toBe(archiveId)

    // Switch to B — should have null activeArchiveId
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneB })
    const { data: tB } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tB as { activeArchiveId: string | null }).activeArchiveId).toBeNull()

    // Switch back to A — should still have the archive
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneA })
    const { data: tA2 } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tA2 as { activeArchiveId: string | null }).activeArchiveId).toBe(archiveId)
  })

  it('new scene gets default tactical_state with tacticalMode=0', async () => {
    const { data: newScene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene C',
      atmosphere: {},
    })
    const sceneC = (newScene as { id: string }).id
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneC })
    const { data: tactical } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tactical as { tacticalMode: number }).tacticalMode).toBe(0)
    expect((tactical as { activeArchiveId: string | null }).activeArchiveId).toBeNull()
  })

  it('rule_system_id in rooms table', async () => {
    const { data: rooms } = await ctx.api('GET', '/api/rooms')
    const room = (rooms as Array<{ id: string; ruleSystemId: string }>).find(
      (r) => r.id === ctx.roomId,
    )
    expect(room?.ruleSystemId).toBeDefined()
  })
})
