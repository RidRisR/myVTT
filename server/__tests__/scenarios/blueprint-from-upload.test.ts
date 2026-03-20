// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('bp-upload-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Blueprint from-upload (atomic)', () => {
  let imageUrl: string

  it('uploads file and creates asset + blueprint atomically', async () => {
    const formData = new FormData()
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
    formData.append('file', blob, 'goblin.png')
    formData.append('name', 'Goblin')
    formData.append('tags', JSON.stringify(['Beast']))
    formData.append('defaults', JSON.stringify({ color: '#ff0000', width: 1, height: 1 }))

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/blueprints/from-upload`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    const bp = (await res.json()) as Record<string, unknown>
    imageUrl = bp.imageUrl as string
    expect(bp.id).toBeTruthy()
    expect(bp.name).toBe('Goblin')
    expect(bp.tags).toEqual(['beast'])
    expect(bp.defaults).toEqual({ color: '#ff0000', width: 1, height: 1 })
    expect(imageUrl).toContain('/uploads/')
  })

  it('asset record was also created', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets`)
    const assets = data as Record<string, unknown>[]
    expect(assets.length).toBeGreaterThanOrEqual(1)
    const asset = assets.find((a) => a.url === imageUrl)
    expect(asset).toBeDefined()
    expect(asset!.name).toBe('Goblin')
    expect(asset!.mediaType).toBe('image')
    expect(asset!.category).toBe('token')
  })

  it('uploaded file is downloadable', async () => {
    const res = await fetch(`${ctx.apiBase}${imageUrl}`)
    expect(res.status).toBe(200)
  })

  it('rejects non-image file types', async () => {
    const formData = new FormData()
    const blob = new Blob(['not an image'], { type: 'text/plain' })
    formData.append('file', blob, 'readme.txt')
    formData.append('name', 'Bad')

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/blueprints/from-upload`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(400)
  })

  it('rejects request without file', async () => {
    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/blueprints/from-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No file' }),
    })
    expect(res.status).toBe(400)
  })
})
