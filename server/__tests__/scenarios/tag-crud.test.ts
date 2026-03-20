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
