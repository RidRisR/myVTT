// @vitest-environment node
// Blueprint Lifecycle E2E — full user journey:
// create blueprint → spawn entities → verify naming → save entity as blueprint → delete → cascade
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, waitForSocketEvent, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('blueprint-lifecycle')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Blueprint Lifecycle Journey', () => {
  let sceneId: string
  let blueprintId: string
  let entity1Id: string
  let entity2Id: string

  // ── Step 1: Setup scene ──

  it('creates a scene for spawning', async () => {
    const { data, status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Dungeon',
    })
    expect(status).toBe(201)
    sceneId = (data as { id: string }).id
  })

  // ── Step 2: Create blueprint ──

  it('creates a blueprint with defaults and tags', async () => {
    const promise = waitForSocketEvent(ctx.socket, 'blueprint:created')
    const { data, status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/blueprints`, {
      name: 'Goblin',
      imageUrl: '/uploads/goblin.png',
      defaults: { color: '#22c55e', width: 1, height: 1, ruleData: { hp: 7 } },
      tags: ['Humanoid', 'Beast'],
    })
    expect(status).toBe(201)
    const bp = data as Record<string, unknown>
    blueprintId = bp.id as string
    expect(bp.tags).toEqual(['humanoid', 'beast'])

    const event = (await promise) as Record<string, unknown>
    expect(event.id).toBe(blueprintId)
  })

  it('blueprint persists across re-fetch', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/blueprints`)
    const list = data as Record<string, unknown>[]
    const bp = list.find((b) => b.id === blueprintId)
    expect(bp).toBeDefined()
    expect(bp!.name).toBe('Goblin')
  })

  // ── Step 3: Spawn entities from blueprint ──

  it('spawns first entity — name is "Goblin 1"', async () => {
    const { data, status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`,
      { blueprintId },
    )
    expect(status).toBe(201)
    const result = data as { entity: Record<string, unknown> }
    entity1Id = result.entity.id as string
    expect(result.entity.name).toBe('Goblin 1')
    expect(result.entity.color).toBe('#22c55e')
    expect(result.entity.width).toBe(1)
    expect(result.entity.blueprintId).toBe(blueprintId)
    expect(result.entity.lifecycle).toBe('ephemeral')
  })

  it('spawns second entity — name increments to "Goblin 2"', async () => {
    const { data, status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`,
      { blueprintId },
    )
    expect(status).toBe(201)
    const result = data as { entity: Record<string, unknown> }
    entity2Id = result.entity.id as string
    expect(result.entity.name).toBe('Goblin 2')
  })

  it('spawned entities appear in scene entity list', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`)
    const entries = data as { entityId: string }[]
    const ids = entries.map((e) => e.entityId)
    expect(ids).toContain(entity1Id)
    expect(ids).toContain(entity2Id)
  })

  it('spawned entity inherits ruleData from blueprint defaults', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${entity1Id}`)
    const entity = data as Record<string, unknown>
    expect(entity.ruleData).toEqual({ hp: 7 })
  })

  // ── Step 4: Save entity as blueprint (round-trip) ──

  it('creates a new blueprint from an existing entity (save-as-blueprint flow)', async () => {
    // Simulate what saveEntityAsBlueprint does: POST /blueprints with entity fields
    const { data: entityData } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities/${entity1Id}`,
    )
    const entity = entityData as Record<string, unknown>

    const promise = waitForSocketEvent(ctx.socket, 'blueprint:created')
    const { data, status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/blueprints`, {
      name: entity.name,
      imageUrl: entity.imageUrl,
      defaults: {
        color: entity.color,
        width: entity.width,
        height: entity.height,
        ruleData: entity.ruleData,
      },
    })
    expect(status).toBe(201)
    const newBp = data as Record<string, unknown>
    expect(newBp.name).toBe('Goblin 1')
    expect(newBp.imageUrl).toBe('/uploads/goblin.png')
    const defaults = newBp.defaults as Record<string, unknown>
    expect(defaults.color).toBe('#22c55e')
    expect(defaults.ruleData).toEqual({ hp: 7 })

    await promise
  })

  // ── Step 5: Update blueprint ──

  it('updates blueprint name and tags', async () => {
    const promise = waitForSocketEvent(ctx.socket, 'blueprint:updated')
    const { status, data } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/blueprints/${blueprintId}`,
      { name: 'Goblin Chief', tags: ['Humanoid'] },
    )
    expect(status).toBe(200)
    const bp = data as Record<string, unknown>
    expect(bp.name).toBe('Goblin Chief')
    expect(bp.tags).toEqual(['humanoid'])

    await promise
  })

  it('spawning after rename uses new name — "Goblin Chief 3"', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`, {
      blueprintId,
    })
    const result = data as { entity: Record<string, unknown> }
    // COUNT(*) of entities with this blueprint_id is 3 (two prior + this one uses count before insert)
    // Actually count is checked before insert, so count=2 at this point → "Goblin Chief 3"
    expect(result.entity.name).toBe('Goblin Chief 3')
  })

  // ── Step 6: Delete blueprint — entities survive ──

  it('deletes blueprint', async () => {
    const promise = waitForSocketEvent(ctx.socket, 'blueprint:deleted')
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/blueprints/${blueprintId}`)
    expect(status).toBe(204)
    await promise
  })

  it('entity 1 survives blueprint deletion with null blueprint_id', async () => {
    const { data, status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${entity1Id}`)
    expect(status).toBe(200)
    const entity = data as Record<string, unknown>
    expect(entity.name).toBe('Goblin 1')
    expect(entity.blueprintId).toBeNull()
    // Entity retains its own data — not affected by blueprint deletion
    expect(entity.color).toBe('#22c55e')
    expect(entity.imageUrl).toBe('/uploads/goblin.png')
  })

  it('entity 2 also survives with null blueprint_id', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${entity2Id}`)
    const entity = data as Record<string, unknown>
    expect(entity.blueprintId).toBeNull()
  })

  // ── Step 7: Tactical-only spawn ──

  it('spawns blueprint in tactical-only mode (no scene_entity link)', async () => {
    // Create a new blueprint for this test
    const { data: bpData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/blueprints`, {
      name: 'Barrel',
      imageUrl: '/uploads/barrel.png',
      defaults: { color: '#8B4513', width: 1, height: 1 },
    })
    const barrelBpId = (bpData as Record<string, unknown>).id as string

    const { data, status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`,
      { blueprintId: barrelBpId, tacticalOnly: true },
    )
    expect(status).toBe(201)
    const result = data as { entity: Record<string, unknown>; sceneEntity: unknown }
    expect(result.entity.name).toBe('Barrel 1')
    expect(result.sceneEntity).toBeNull()

    // Entity should NOT appear in scene entity list
    const { data: seData } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    const entries = seData as { entityId: string }[]
    expect(entries.find((e) => e.entityId === (result.entity.id as string))).toBeUndefined()
  })
})
