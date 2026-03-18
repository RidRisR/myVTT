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

describe('Asset Tagging', () => {
  let assetId: string

  it('upload stores tags in tags column', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['test'], { type: 'image/png' }), 'map.png')
    formData.append('mediaType', 'image')
    formData.append('extra', JSON.stringify({ tags: ['map'] }))

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    const status = res.status
    const data = (await res.json()) as Record<string, unknown>
    expect(status).toBe(201)
    expect(data.mediaType).toBe('image')
    expect(data.tags).toEqual(['map'])
    assetId = data.id as string
  })

  it('filters assets by mediaType query param', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets?mediaType=image`)
    const list = data as Record<string, unknown>[]
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((a) => a.mediaType === 'image')).toBe(true)
  })

  it('PATCH updates tags in tags column', async () => {
    const { data, status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/${assetId}`, {
      tags: ['map', 'cave'],
    })
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).tags).toEqual(['map', 'cave'])
  })
})
