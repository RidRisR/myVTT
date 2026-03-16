// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('asset-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Asset Roundtrip Journey', () => {
  let assetId: string
  let assetUrl: string

  it('3.1 uploads a PNG image', async () => {
    const formData = new FormData()
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
    formData.append('file', blob, 'test-map.png')
    formData.append('type', 'image')

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    const data = (await res.json()) as Record<string, unknown>
    assetId = data.id as string
    assetUrl = data.url as string
    expect(data.type).toBe('image')
    expect(Array.isArray(data.tags)).toBe(true) // NOT a string
  })

  it('3.2 lists assets with correct contract shape', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets`)
    const assets = data as Record<string, unknown>[]
    expect(assets).toHaveLength(1)
    const asset = assets[0]!
    expect(asset.id).toBe(assetId)
    expect(Array.isArray(asset.tags)).toBe(true)
    expect(typeof asset.createdAt).toBe('number')
    // No snake_case leak
    expect(asset).not.toHaveProperty('created_at')
    expect(asset).toHaveProperty('createdAt')
  })

  it('3.3 uploaded file is downloadable', async () => {
    const res = await fetch(`${ctx.apiBase}${assetUrl}`)
    expect(res.status).toBe(200)
  })

  it('3.4 deletes asset and removes file', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/assets/${assetId}`)
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets`)
    expect(data as unknown[]).toHaveLength(0)

    // File should be gone
    const res = await fetch(`${ctx.apiBase}${assetUrl}`)
    expect(res.status).toBe(404)
  })

  // ── Blueprint asset persistence (regression: blueprints were local-only) ──

  let blueprintId: string
  let blueprintUrl: string

  it('3.5 uploads a blueprint asset with metadata', async () => {
    const formData = new FormData()
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
    formData.append('file', blob, 'goblin-token.png')
    formData.append('name', 'Goblin')
    formData.append('type', 'blueprint')
    formData.append(
      'extra',
      JSON.stringify({
        tags: [],
        blueprint: { defaultSize: 1, defaultColor: '#00ff00' },
      }),
    )

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    const data = (await res.json()) as Record<string, unknown>
    blueprintId = data.id as string
    blueprintUrl = data.url as string
    expect(data.type).toBe('blueprint')
    expect(data.name).toBe('Goblin')
    const extra = data.extra as Record<string, unknown>
    const blueprint = extra.blueprint as Record<string, unknown>
    expect(blueprint.defaultSize).toBe(1)
    expect(blueprint.defaultColor).toBe('#00ff00')
  })

  it('3.6 blueprint does NOT appear when filtering by type=image', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets?type=image`)
    const assets = data as Record<string, unknown>[]
    expect(assets.every((a) => a.type !== 'blueprint')).toBe(true)
  })

  it('3.7 blueprint appears when filtering by type=blueprint', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets?type=blueprint`)
    const assets = data as Record<string, unknown>[]
    expect(assets).toHaveLength(1)
    expect(assets[0]!.id).toBe(blueprintId)
  })

  it('3.8 PATCH updates blueprint name', async () => {
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/assets/${blueprintId}`,
      { name: 'Goblin Chief' },
    )
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).name).toBe('Goblin Chief')

    // Verify persistence via GET
    const { data: list } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets?type=blueprint`)
    expect((list as Record<string, unknown>[])[0]!.name).toBe('Goblin Chief')
  })

  it('3.9 PATCH updates blueprint extra metadata', async () => {
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/assets/${blueprintId}`,
      { blueprint: { defaultSize: 2, defaultColor: '#ff0000' } },
    )
    expect(status).toBe(200)
    const extra = (data as Record<string, unknown>).extra as Record<string, unknown>
    const bp = extra.blueprint as Record<string, unknown>
    expect(bp.defaultSize).toBe(2)
    expect(bp.defaultColor).toBe('#ff0000')
  })

  it('3.10 PATCH returns 404 for non-existent asset', async () => {
    const { status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/non-existent-id`, {
      name: 'nope',
    })
    expect(status).toBe(404)
  })

  it('3.11 blueprint persists across re-fetch (survives refresh)', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets?type=blueprint`)
    const assets = data as Record<string, unknown>[]
    expect(assets).toHaveLength(1)
    expect(assets[0]!.name).toBe('Goblin Chief')
    expect(assets[0]!.url).toBe(blueprintUrl)
  })

  it('3.12 deleting blueprint removes it', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/assets/${blueprintId}`)
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets?type=blueprint`)
    expect(data as unknown[]).toHaveLength(0)
  })

  // ── Security ──

  it('3.13 rejects non-media file types (security)', async () => {
    const formData = new FormData()
    const blob = new Blob(['#!/bin/bash\necho pwned'], { type: 'application/x-shellscript' })
    formData.append('file', blob, 'evil.sh')

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(400)
  })
})
