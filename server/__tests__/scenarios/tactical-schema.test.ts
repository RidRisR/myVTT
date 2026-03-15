// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('tactical-schema-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Tactical Schema', () => {
  it('creating a scene auto-creates a tactical_state row', async () => {
    const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Arena',
      atmosphere: {},
    })
    const sceneId = (scene as { id: string }).id

    // Set it as active and verify tactical state exists
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
    const { status, data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect(status).toBe(200)
    const state = data as { sceneId: string; roundNumber: number }
    expect(state.sceneId).toBe(sceneId)
    expect(state.roundNumber).toBe(0)
  })

  it('room_state includes tacticalMode field (as 0)', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    const state = data as { tacticalMode: number }
    expect(state.tacticalMode).toBe(0)
  })

  it('room_state has activeArchiveId field (not activeEncounterId)', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
    const state = data as Record<string, unknown>
    expect('activeArchiveId' in state).toBe(true)
    expect('activeEncounterId' in state).toBe(false)
    expect(state.activeArchiveId).toBeNull()
  })
})
