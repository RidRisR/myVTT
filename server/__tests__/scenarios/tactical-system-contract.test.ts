// @vitest-environment node
// Integration test: comprehensive tactical system contract
// Covers the full set of user expectations:
//   1. Scene creation auto-creates tactical_state
//   2. Tactical mode works without a map (blank canvas)
//   3. Per-scene tactical_state independence
//   4. Scene switch preserves/restores per-scene state
//   5. Scene switch broadcasts correct tactical state
//   6. Reconnection restores tactical state
//   7. Archive save/load on blank canvas scene
//   8. Cannot delete last scene (server guard)
//   9. Room always has at least one scene
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestRoom,
  connectSecondClient,
  waitForSocketEvent,
  type TestContext,
} from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('tactical-system-contract')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Tactical System Contract', () => {
  let scene1Id: string
  let scene2Id: string

  // ── 1. Scene creation auto-creates tactical_state ──

  describe('scene creation auto-creates tactical_state', () => {
    it('creating a scene returns 201 and auto-creates tactical_state row', async () => {
      const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
        name: 'Scene Alpha',
        atmosphere: {},
      })
      expect(status).toBe(201)
      scene1Id = (data as { id: string }).id

      // Activate and verify tactical_state exists
      await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene1Id })
      const { status: tStatus, data: tactical } = await ctx.api(
        'GET',
        `/api/rooms/${ctx.roomId}/tactical`,
      )
      expect(tStatus).toBe(200)
      const state = tactical as { sceneId: string; tokens: unknown[]; tacticalMode: number }
      expect(state.sceneId).toBe(scene1Id)
      expect(state.tokens).toEqual([])
      expect(state.tacticalMode).toBe(0)
    })
  })

  // ── 2. Tactical mode works without a map (blank canvas) ──

  describe('blank canvas tactical mode (no map required)', () => {
    it('can enter tactical mode without uploading a map', async () => {
      const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)
      expect(status).toBe(200)
      expect((data as { tacticalMode: number }).tacticalMode).toBe(1)

      // Verify mapUrl is null (blank canvas)
      const { data: state } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
      const s = state as { mapUrl: string | null; tacticalMode: number }
      expect(s.mapUrl).toBeNull()
      expect(s.tacticalMode).toBe(1)
    })

    it('can create tokens on a blank canvas (no map)', async () => {
      const { status, data } = await ctx.api(
        'POST',
        `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
        { x: 3, y: 4, name: 'Blank Canvas Token', color: '#ff0000' },
      )
      expect(status).toBe(201)
      const result = data as { token: { id: string; x: number; y: number } }
      expect(result.token.x).toBe(3)
      expect(result.token.y).toBe(4)

      // Verify token exists in tactical state
      const { data: tactical } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
      const tokens = (tactical as { tokens: { x: number }[] }).tokens
      expect(tokens.length).toBeGreaterThanOrEqual(1)
      expect(tokens.some((t) => t.x === 3)).toBe(true)
    })

    it('can update grid settings on a blank canvas', async () => {
      const { status, data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
        grid: { size: 60, visible: true },
      })
      expect(status).toBe(200)
      const s = data as { grid: { size: number; visible: boolean }; mapUrl: string | null }
      expect(s.grid.size).toBe(60)
      expect(s.grid.visible).toBe(true)
      expect(s.mapUrl).toBeNull() // still no map
    })
  })

  // ── 3 & 4. Per-scene tactical_state independence + scene switch ──

  describe('per-scene tactical_state independence', () => {
    it('setup: create Scene 2 with different tactical state', async () => {
      const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
        name: 'Scene Beta',
        atmosphere: {},
      })
      scene2Id = (data as { id: string }).id

      // Switch to scene2 and set up its tactical state
      await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene2Id })
      await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)
      await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
        mapUrl: '/maps/dungeon.jpg',
        mapWidth: 2000,
        mapHeight: 1500,
      })

      const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
        name: 'Scene2 Fighter',
        lifecycle: 'reusable',
      })
      await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens`, {
        entityId: (entity as { id: string }).id,
        x: 200,
        y: 300,
      })
    })

    it('switching back to Scene 1 restores its tactical state', async () => {
      await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene1Id })
      const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
      const state = data as {
        sceneId: string
        mapUrl: string | null
        tokens: { x: number }[]
        grid: { size: number }
        tacticalMode: number
      }
      expect(state.sceneId).toBe(scene1Id)
      expect(state.mapUrl).toBeNull() // blank canvas preserved
      expect(state.grid.size).toBe(60) // grid settings preserved
      expect(state.tacticalMode).toBe(1) // was entered
      expect(state.tokens.some((t) => t.x === 3)).toBe(true) // token preserved
    })

    it('switching to Scene 2 restores its tactical state', async () => {
      await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene2Id })
      const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
      const state = data as {
        sceneId: string
        mapUrl: string
        tokens: { x: number }[]
      }
      expect(state.sceneId).toBe(scene2Id)
      expect(state.mapUrl).toBe('/maps/dungeon.jpg')
      expect(state.tokens.some((t) => t.x === 200)).toBe(true)
    })
  })

  // ── 5. Scene switch broadcasts correct tactical state via Socket.io ──

  describe('scene switch broadcasts tactical state', () => {
    it('PATCH /state with activeSceneId broadcasts tactical:updated for new scene', async () => {
      // Start on scene2, switch to scene1
      await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene2Id })

      const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

      const eventPromise = waitForSocketEvent<{
        sceneId: string
        mapUrl: string | null
      }>(socket2, 'tactical:updated')

      await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene1Id })

      const payload = await eventPromise
      expect(payload.sceneId).toBe(scene1Id)
      expect(payload.mapUrl).toBeNull() // scene1 is blank canvas

      socket2.disconnect()
    })
  })

  // ── 6. Reconnection restores tactical state (via GET /tactical) ──

  describe('reconnection restores tactical state', () => {
    it('GET /tactical returns current active scene state (simulates reconnection)', async () => {
      // Ensure scene1 is active
      await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene1Id })

      // Simulate reconnection: a new client calls GET /tactical
      const { status, data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
      expect(status).toBe(200)
      const state = data as {
        sceneId: string
        mapUrl: string | null
        tacticalMode: number
        tokens: { x: number }[]
        grid: { size: number }
      }
      expect(state.sceneId).toBe(scene1Id)
      expect(state.tacticalMode).toBe(1)
      expect(state.mapUrl).toBeNull()
      expect(state.grid.size).toBe(60)
      expect(state.tokens.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── 7. Archive save/load on blank canvas scene ──

  describe('archive save/load on blank canvas', () => {
    let archiveId: string

    it('can create an archive for a blank canvas scene', async () => {
      await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: scene1Id })
      const { status, data } = await ctx.api(
        'POST',
        `/api/rooms/${ctx.roomId}/scenes/${scene1Id}/archives`,
        { name: 'Blank Canvas Snapshot' },
      )
      expect(status).toBe(201)
      archiveId = (data as { id: string }).id
    })

    it('save captures blank canvas state (null mapUrl + tokens + grid)', async () => {
      const { status, data } = await ctx.api(
        'POST',
        `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`,
      )
      expect(status).toBe(200)
      const saved = data as { mapUrl: string | null; grid: { size: number } }
      expect(saved.mapUrl).toBeNull()
      expect(saved.grid.size).toBe(60)
    })

    it('load restores blank canvas state after modifications', async () => {
      // Modify current state: add map + extra token
      await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
        mapUrl: '/maps/temp.jpg',
      })
      await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/quick`, {
        x: 99,
        y: 99,
        name: 'Extra Token',
      })

      // Load archive — should restore blank canvas
      const { status, data } = await ctx.api(
        'POST',
        `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`,
      )
      expect(status).toBe(200)

      const loaded = data as {
        mapUrl: string | null
        grid: { size: number }
        tokens: { x: number }[]
      }
      expect(loaded.mapUrl).toBeNull() // restored to blank canvas
      expect(loaded.grid.size).toBe(60)
      // Extra token at (99,99) should be gone, original at (3,4) should remain
      expect(loaded.tokens.find((t) => t.x === 99)).toBeUndefined()
      expect(loaded.tokens.some((t) => t.x === 3)).toBe(true)
    })
  })

  // ── 8 & 9. Cannot delete last scene ──

  describe('cannot delete last scene', () => {
    it('deleting a scene when multiple exist succeeds', async () => {
      // We have scene1 and scene2; delete scene2
      const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${scene2Id}`)
      expect(status).toBe(200)

      // Verify only scene1 remains
      const { data: scenes } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes`)
      expect(scenes as unknown[]).toHaveLength(1)
    })

    it('deleting the last scene returns 400', async () => {
      const { status, data } = await ctx.api(
        'DELETE',
        `/api/rooms/${ctx.roomId}/scenes/${scene1Id}`,
      )
      expect(status).toBe(400)
      expect((data as { error: string }).error).toContain('Cannot delete the last scene')
    })

    it('the scene still exists after failed deletion', async () => {
      const { data: scenes } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes`)
      expect(scenes as unknown[]).toHaveLength(1)
      expect((scenes as { id: string }[])[0]!.id).toBe(scene1Id)
    })
  })
})
