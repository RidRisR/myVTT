// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('spawn-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Spawn from Blueprint Journey', () => {
  let sceneId: string, blueprintId: string

  it('creates a scene', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Tavern',
      atmosphere: {},
    })
    sceneId = (data as { id: string }).id
  })

  it('creates a blueprint asset', async () => {
    // Asset creation requires multipart/form-data (multer)
    const formData = new FormData()
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
    formData.append('file', blob, 'goblin.png')
    formData.append('name', '\u54E5\u5E03\u6797')
    formData.append('type', 'blueprint')
    formData.append(
      'extra',
      JSON.stringify({
        blueprint: { defaultSize: 1, defaultColor: '#22c55e', defaultRuleData: {} },
      }),
    )

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    blueprintId = data.id
  })

  it('spawns entity from blueprint', async () => {
    const { data, status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`,
      { blueprintId },
    )
    expect(status).toBe(201)
    const result = data as {
      entity: { id: string; name: string; lifecycle: string; color: string }
      sceneEntity: { visible: boolean }
    }
    expect(result.entity.name).toBe('\u54E5\u5E03\u6797 1')
    expect(result.entity.lifecycle).toBe('ephemeral')
    expect(result.entity.color).toBe('#22c55e')
    expect(result.sceneEntity.visible).toBe(true)
  })

  it('spawns second entity with incremented name', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`, {
      blueprintId,
    })
    const result = data as { entity: { name: string } }
    expect(result.entity.name).toBe('\u54E5\u5E03\u6797 2')
  })

  it('spawned entity appears in scene entity list', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`)
    const entries = data as { entityId: string; visible: boolean }[]
    expect(entries.length).toBeGreaterThanOrEqual(2)
    expect(entries.every((e) => e.visible === true)).toBe(true)
  })

  it('rejects spawn with invalid blueprint', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`, {
      blueprintId: 'nonexistent',
    })
    expect(status).toBe(404)
  })
})
