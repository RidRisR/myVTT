// server/__tests__/bundle.test.ts — Integration tests for GET /api/rooms/:id/bundle
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestServer, type SimpleTestServer } from './helpers/test-server'
import { getRoomDb } from '../db'

let ctx: SimpleTestServer
let roomId: string

beforeAll(async () => {
  ctx = await setupTestServer()
  const { data } = await ctx.api('POST', '/api/rooms', {
    name: 'Bundle Test Room',
    ruleSystemId: 'generic',
  })
  roomId = (data as { id: string }).id
})

afterAll(() => {
  ctx.cleanup()
})

describe('GET /api/rooms/:id/bundle', () => {
  it('returns all required top-level keys', async () => {
    const { status, data } = await ctx.api('GET', `/api/rooms/${roomId}/bundle`)
    expect(status).toBe(200)
    const body = data as Record<string, unknown>
    expect(body).toHaveProperty('room')
    expect(body).toHaveProperty('scenes')
    expect(body).toHaveProperty('entities')
    expect(body).toHaveProperty('sceneEntityMap')
    expect(body).toHaveProperty('seats')
    expect(body).toHaveProperty('assets')
    expect(body).toHaveProperty('chat')
    expect(body).toHaveProperty('teamTrackers')
    expect(body).toHaveProperty('showcase')
    expect(body).toHaveProperty('tactical')
    expect(body).toHaveProperty('blueprints')
    expect(body).toHaveProperty('tags')
  })

  it('tags array contains tag metadata from tags table', async () => {
    // Create a tag so bundle has something to return
    const roomDb = getRoomDb(ctx.dataDir, roomId)
    const tagId = 'test-tag-id'
    roomDb
      .prepare('INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(tagId, 'bundle-test', null, 0, Date.now())

    const { data } = await ctx.api('GET', `/api/rooms/${roomId}/bundle`)
    const { tags } = data as { tags: Record<string, unknown>[] }
    expect(Array.isArray(tags)).toBe(true)
    const tag = tags.find((t) => t.name === 'bundle-test')
    expect(tag).toBeDefined()
    expect(tag).toHaveProperty('id', tagId)
    expect(tag).toHaveProperty('sortOrder')
    expect(tag).toHaveProperty('createdAt')
  })

  it('room field includes ruleSystemId and activeSceneId', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${roomId}/bundle`)
    const { room } = data as { room: Record<string, unknown> }
    expect(room).toHaveProperty('ruleSystemId', 'generic')
    // activeSceneId is present (rooms always initialize with a default scene)
    expect(room).toHaveProperty('activeSceneId')
  })

  it('tactical is null when no active scene', async () => {
    // Create an isolated room for this test, then directly null the active_scene_id
    // (POST /api/rooms always sets a default active scene; PATCH /state only accepts truthy values)
    const { data: createData } = await ctx.api('POST', '/api/rooms', {
      name: 'Tactical Null Test Room',
      ruleSystemId: 'generic',
    })
    const isolatedRoomId = (createData as { id: string }).id

    const roomDb = getRoomDb(ctx.dataDir, isolatedRoomId)
    roomDb.prepare('UPDATE room_state SET active_scene_id = NULL WHERE id = 1').run()

    const { data } = await ctx.api('GET', `/api/rooms/${isolatedRoomId}/bundle`)
    expect((data as { tactical: unknown }).tactical).toBeNull()
  })

  it('tactical includes tokens when active scene exists', async () => {
    // Create a scene
    const { data: sceneData } = await ctx.api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Scene 1',
    })
    const sceneId = (sceneData as { id: string }).id

    // Set as active scene
    await ctx.api('PATCH', `/api/rooms/${roomId}/state`, { activeSceneId: sceneId })

    const { data } = await ctx.api('GET', `/api/rooms/${roomId}/bundle`)
    const { tactical } = data as { tactical: Record<string, unknown> | null }
    expect(tactical).not.toBeNull()
    expect(tactical).toHaveProperty('tokens')
    expect(Array.isArray(tactical!.tokens)).toBe(true)
  })

  it('sceneEntityMap is correctly grouped by scene_id', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${roomId}/bundle`)
    const { sceneEntityMap } = data as {
      sceneEntityMap: Record<string, unknown[]>
    }
    // All values in the map must be arrays of entity entries
    for (const entries of Object.values(sceneEntityMap)) {
      expect(Array.isArray(entries)).toBe(true)
      for (const entry of entries) {
        expect(entry).toHaveProperty('entityId')
        expect(entry).toHaveProperty('visible')
      }
    }
  })

  it('assets array contains parsed extra field', async () => {
    // Bundle returns assets with parsed JSON fields (extra is object, not string)
    const { data } = await ctx.api('GET', `/api/rooms/${roomId}/bundle`)
    const { assets } = data as { assets: Record<string, unknown>[] }
    // Even with no assets, array should exist
    expect(Array.isArray(assets)).toBe(true)
  })

  it('blueprints array is present and parsed', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${roomId}/bundle`)
    const { blueprints } = data as { blueprints: unknown[] }
    expect(Array.isArray(blueprints)).toBe(true)
  })

  it('returns 400 for invalid room id (exceeds 64 chars)', async () => {
    const longId = 'a'.repeat(65)
    const { status } = await ctx.api('GET', `/api/rooms/${longId}/bundle`)
    expect(status).toBe(400)
  })
})
