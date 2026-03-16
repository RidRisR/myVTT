// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('tactical-error-cases-test')
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Tactical error cases: no active scene (404)', () => {
  beforeAll(async () => {
    // Room now starts with a default scene; clear it to test no-scene error paths
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: null })
  })

  it('GET /tactical with no active scene returns 404', async () => {
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect(status).toBe(404)
  })

  it('PATCH /tactical with no active scene returns 404', async () => {
    const { status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
      mapUrl: '/test.jpg',
    })
    expect(status).toBe(404)
  })

  it('POST /tactical/tokens with no active scene returns 404', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens`, {
      entityId: 'fake-entity',
      x: 0,
      y: 0,
    })
    // entityId check happens before scene check, so this may be 404 for entity or scene
    expect(status).toBe(404)
  })

  it('POST /tactical/tokens/quick with no active scene returns 404', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/quick`, {
      x: 0,
      y: 0,
      name: 'Test',
    })
    expect(status).toBe(404)
  })

  it('POST /tactical/tokens/from-entity with no active scene returns 404', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`,
      {
        entityId: 'fake-entity',
        x: 0,
        y: 0,
      },
    )
    // entityId check happens before scene check, so this may be 404 for entity or scene
    expect(status).toBe(404)
  })
})

describe('Tactical error cases: resource not found (404)', () => {
  let sceneId: string

  beforeAll(async () => {
    // Create scene and set active for these tests
    const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Error Test Scene',
      atmosphere: {},
    })
    sceneId = (scene as { id: string }).id
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
  })

  it('POST /tactical/tokens with non-existent entityId returns 404', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens`, {
      entityId: 'nonexistent-entity-id',
      x: 0,
      y: 0,
    })
    expect(status).toBe(404)
  })

  it('POST /tactical/tokens/from-entity with non-existent entityId returns 404', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`,
      {
        entityId: 'nonexistent-entity-id',
        x: 0,
        y: 0,
      },
    )
    expect(status).toBe(404)
  })

  it('POST /tactical/tokens/:tokenId/duplicate with non-existent tokenId returns 404', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/nonexistent-token/duplicate`,
      {},
    )
    expect(status).toBe(404)
  })

  it('PATCH /tactical/tokens/nonexistent returns 404', async () => {
    const { status } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/tactical/tokens/nonexistent`,
      { x: 5 },
    )
    expect(status).toBe(404)
  })

  it('DELETE /tactical/tokens/nonexistent returns 404', async () => {
    const { status } = await ctx.api(
      'DELETE',
      `/api/rooms/${ctx.roomId}/tactical/tokens/nonexistent`,
    )
    expect(status).toBe(404)
  })
})

describe('Tactical idempotency', () => {
  it('POST /tactical/enter twice returns 200 both times', async () => {
    const { status: s1 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)
    expect(s1).toBe(200)

    const { status: s2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)
    expect(s2).toBe(200)
  })

  it('PATCH /tactical with empty body returns 200, state unchanged', async () => {
    // Get state before
    const { data: before } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)

    // Patch with empty body
    const { status, data: after } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {})
    expect(status).toBe(200)

    // State should be unchanged
    expect((after as { mapUrl: unknown }).mapUrl).toEqual((before as { mapUrl: unknown }).mapUrl)
  })
})
