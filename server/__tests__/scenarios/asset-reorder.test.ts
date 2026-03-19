// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('asset-reorder-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

/** Upload a minimal test asset via multipart FormData (matches existing pattern) */
async function uploadTestAsset(name: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', new Blob(['test'], { type: 'image/png' }), `${name}.png`)
  formData.append('mediaType', 'image')
  const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
    method: 'POST',
    body: formData,
  })
  const data = (await res.json()) as { id: string }
  return data.id
}

describe('Asset reorder', () => {
  let assetIds: string[]

  beforeAll(async () => {
    assetIds = []
    for (let i = 0; i < 3; i++) {
      assetIds.push(await uploadTestAsset(`test${i}`))
    }
  })

  it('should batch reorder assets', async () => {
    const order = [
      { id: assetIds[2], sortOrder: 1000 },
      { id: assetIds[0], sortOrder: 2000 },
      { id: assetIds[1], sortOrder: 3000 },
    ]
    const res = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/reorder`, { order })
    expect(res.status).toBe(200)

    // Verify order
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets`)
    const list = data as { id: string }[]
    expect(list[0]!.id).toBe(assetIds[2])
    expect(list[1]!.id).toBe(assetIds[0])
    expect(list[2]!.id).toBe(assetIds[1])
  })

  it('should return 400 for invalid order payload', async () => {
    const res = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/reorder`, { order: 'bad' })
    expect(res.status).toBe(400)
  })
})
