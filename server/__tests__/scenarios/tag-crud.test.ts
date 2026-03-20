// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('tag-crud-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Tag CRUD', () => {
  let tagId: string

  it('creates a tag', async () => {
    const { data, status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tags`, {
      name: '  Forest  ',
    })
    expect(status).toBe(201)
    const tag = data as Record<string, unknown>
    expect(tag.name).toBe('forest') // normalized
    tagId = tag.id as string
  })

  it('rejects duplicate tag name', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tags`, {
      name: 'FOREST', // case-insensitive dup
    })
    expect(status).toBe(409)
  })

  it('lists all tags', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tags`)
    const tags = data as Record<string, unknown>[]
    expect(tags.length).toBeGreaterThanOrEqual(1)
    expect(tags.some((t) => t.name === 'forest')).toBe(true)
  })

  it('renames a tag', async () => {
    const { data, status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tags/${tagId}`, {
      name: 'Jungle',
    })
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).name).toBe('jungle')
  })

  it('deletes a tag', async () => {
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/tags/${tagId}`)
    expect(status).toBe(204)
  })

  it('tag is gone after delete', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tags`)
    const tags = data as Record<string, unknown>[]
    expect(tags.some((t) => t.id === tagId)).toBe(false)
  })
})

describe('Tag cascade & propagation', () => {
  let assetId: string
  let propagationTagId: string

  // Seed: upload an asset with a tag for the remaining tests
  it('setup: upload asset with tag', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['img'], { type: 'image/png' }), 'prop.png')
    formData.append('mediaType', 'image')
    formData.append('tags', JSON.stringify(['propagation-tag']))

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    const asset = (await res.json()) as Record<string, unknown>
    assetId = asset.id as string
    expect(asset.tags).toEqual(['propagation-tag'])

    // Get the tag ID for later use
    const { data: allTags } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tags`)
    const tag = (allTags as Record<string, unknown>[]).find((t) => t.name === 'propagation-tag')
    propagationTagId = tag!.id as string
  })

  it('rename tag propagates to asset tags', async () => {
    // Rename "propagation-tag" → "renamed-tag"
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tags/${propagationTagId}`, {
      name: 'renamed-tag',
    })

    // Asset should now reflect the new name
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets`)
    const asset = (data as Record<string, unknown>[]).find((a) => a.id === assetId)
    expect(asset!.tags).toEqual(['renamed-tag'])
  })

  it('delete tag removes it from asset tags via CASCADE', async () => {
    // Delete "renamed-tag"
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/tags/${propagationTagId}`)
    expect(status).toBe(204)

    // Asset should have no tags now
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets`)
    const asset = (data as Record<string, unknown>[]).find((a) => a.id === assetId)
    expect(asset!.tags).toEqual([])
  })
})
