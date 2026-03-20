// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('asset-tagging-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Asset Tagging (category + junction table)', () => {
  let assetId: string

  it('upload with category and tags', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['test'], { type: 'image/png' }), 'map.png')
    formData.append('mediaType', 'image')
    formData.append('category', 'map')
    formData.append('tags', JSON.stringify(['forest', 'cave']))

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.category).toBe('map')
    expect(data.tags).toEqual(expect.arrayContaining(['forest', 'cave']))
    assetId = data.id as string
  })

  it('category defaults to map', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['test'], { type: 'image/png' }), 'default.png')
    formData.append('mediaType', 'image')

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    const data = (await res.json()) as Record<string, unknown>
    expect(data.category).toBe('map')
    expect(data.tags).toEqual([])
  })

  it('filters by category', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets?category=map`)
    const list = data as Record<string, unknown>[]
    expect(list.every((a) => a.category === 'map')).toBe(true)
  })

  it('PATCH updates tags via junction table', async () => {
    const { data, status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/${assetId}`, {
      tags: ['forest', 'dungeon'],
    })
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).tags).toEqual(
      expect.arrayContaining(['forest', 'dungeon']),
    )
  })

  it('PATCH updates category', async () => {
    const { data, status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/${assetId}`, {
      category: 'token',
    })
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).category).toBe('token')
  })

  it('tags are auto-created in tags table', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tags`)
    const tags = data as Record<string, unknown>[]
    const names = tags.map((t) => t.name)
    expect(names).toContain('forest')
    expect(names).toContain('dungeon')
  })

  it('PATCH rejects invalid category', async () => {
    const { status, data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/${assetId}`, {
      category: 'invalid',
    })
    expect(status).toBe(400)
    expect((data as Record<string, unknown>).error).toContain('category')
  })

  it('PATCH tags is idempotent', async () => {
    const tags = ['forest', 'dungeon']
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/${assetId}`, { tags })
    const { data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/${assetId}`, { tags })
    expect((data as Record<string, unknown>).tags).toEqual(expect.arrayContaining(tags))
    expect((data as Record<string, unknown>).tags).toHaveLength(tags.length)
  })

  it('DELETE asset cleans up junction rows', async () => {
    // Upload a fresh asset with tags
    const formData = new FormData()
    formData.append('file', new Blob(['test'], { type: 'image/png' }), 'temp.png')
    formData.append('mediaType', 'image')
    formData.append('tags', JSON.stringify(['cascade-test']))

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    const asset = (await res.json()) as Record<string, unknown>
    const tempId = asset.id as string
    expect(asset.tags).toEqual(['cascade-test'])

    // Delete the asset
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/assets/${tempId}`)
    expect(status).toBe(200)

    // Tag itself should still exist (only junction row removed)
    const { data: allTags } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tags`)
    const tagNames = (allTags as Record<string, unknown>[]).map((t) => t.name)
    expect(tagNames).toContain('cascade-test')
  })
})
