// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'
import type { Blueprint } from '../../../src/shared/entityTypes'

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
    // No explicit defaults — server will create default components with upload URL

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/blueprints/from-upload`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    const bp = (await res.json()) as Blueprint
    expect(bp.id).toBeTruthy()
    expect(bp.tags).toEqual(['beast'])
    // Server creates default components: core:identity with name+imageUrl, core:appearance with defaults
    const identity = bp.defaults.components['core:identity'] as Record<string, unknown>
    expect(identity.name).toBe('Goblin')
    imageUrl = identity.imageUrl as string
    expect(imageUrl).toContain('/uploads/')
    const appearance = bp.defaults.components['core:appearance'] as Record<string, unknown>
    expect(appearance.color).toBe('#3b82f6')
    expect(appearance.width).toBe(1)
    expect(appearance.height).toBe(1)
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
