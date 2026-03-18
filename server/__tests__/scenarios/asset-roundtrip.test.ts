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
    formData.append('mediaType', 'image')

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    const data = (await res.json()) as Record<string, unknown>
    assetId = data.id as string
    assetUrl = data.url as string
    expect(data.mediaType).toBe('image')
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
