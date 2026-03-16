// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestRoom,
  connectSecondClient,
  waitForSocketEvent,
  type TestContext,
} from '../helpers/test-server'

let ctx: TestContext
let sceneId: string

beforeAll(async () => {
  ctx = await setupTestRoom('archive-broadcast-test')

  // Setup: scene + active scene
  const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
    name: 'Archive Broadcast Scene',
    atmosphere: {},
  })
  sceneId = (scene as { id: string }).id
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneId })
})

afterAll(async () => {
  await ctx.cleanup()
})

describe('Archive broadcast tests', () => {
  it('POST /scenes/:id/archives broadcasts archive:created', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    const eventPromise = waitForSocketEvent<{ id: string; name: string }>(
      socket2,
      'archive:created',
    )

    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`, {
      name: 'Broadcast Archive',
    })
    const archiveId = (data as { id: string }).id

    const payload = await eventPromise
    expect(payload.id).toBe(archiveId)
    expect(payload.name).toBe('Broadcast Archive')

    socket2.disconnect()
  })

  it('PATCH /archives/:id broadcasts archive:updated', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Create archive
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'To Update' },
    )
    const archiveId = (archive as { id: string }).id

    const eventPromise = waitForSocketEvent<{ id: string; name: string }>(
      socket2,
      'archive:updated',
    )

    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/archives/${archiveId}`, {
      name: 'Updated Name',
    })

    const payload = await eventPromise
    expect(payload.id).toBe(archiveId)
    expect(payload.name).toBe('Updated Name')

    socket2.disconnect()
  })

  it('DELETE /archives/:id broadcasts archive:deleted', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Create archive to delete
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'To Delete' },
    )
    const archiveId = (archive as { id: string }).id

    const eventPromise = waitForSocketEvent<{ id: string }>(socket2, 'archive:deleted')

    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/archives/${archiveId}`)

    const payload = await eventPromise
    expect(payload.id).toBe(archiveId)

    socket2.disconnect()
  })

  it('POST /archives/:id/save broadcasts archive:updated', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Create archive
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Save Broadcast Test' },
    )
    const archiveId = (archive as { id: string }).id

    const eventPromise = waitForSocketEvent<{ id: string }>(socket2, 'archive:updated')

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)

    const payload = await eventPromise
    expect(payload.id).toBe(archiveId)

    socket2.disconnect()
  })

  it('POST /archives/:id/load broadcasts tactical:updated', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Create and save an archive
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Load Broadcast Test' },
    )
    const archiveId = (archive as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)

    const eventPromise = waitForSocketEvent<{ tokens: unknown[] }>(socket2, 'tactical:updated')

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`)

    const payload = await eventPromise
    expect(payload).toBeDefined()
    expect(payload.tokens).toBeDefined()

    socket2.disconnect()
  })

  it('POST /archives/:id/load broadcasts entity:deleted for orphan ephemerals', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Clear existing tokens first by loading an empty archive
    const { data: emptyArchive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Empty Cleanup' },
    )
    const emptyArchiveId = (emptyArchive as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${emptyArchiveId}/save`)
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${emptyArchiveId}/load`)

    // Now start fresh: quick-create token A (ephemeral entity)
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/quick`, {
      x: 1,
      y: 1,
      name: 'Survivor',
    })

    // Save archive (snapshots Survivor only)
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Orphan Test' },
    )
    const archiveId = (archive as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)

    // Quick-create token B (orphan — not in archive)
    const { data: quickB } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/tactical/tokens/quick`,
      { x: 99, y: 99, name: 'Orphan' },
    )
    const orphanEntityId = (quickB as { entity: { id: string } }).entity.id

    // Collect all entity:deleted events during load
    const deletedIds: string[] = []
    const collectHandler = (data: { id: string }) => {
      deletedIds.push(data.id)
    }
    socket2.on('entity:deleted', collectHandler)

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`)

    // Give events a moment to arrive
    await new Promise((r) => setTimeout(r, 100))

    socket2.off('entity:deleted', collectHandler)

    // The orphan entity should be among the deleted
    expect(deletedIds).toContain(orphanEntityId)

    socket2.disconnect()
  })

  it('POST /archives/:id/load broadcasts entity:created for restored ephemerals', async () => {
    const socket2 = await connectSecondClient(ctx.apiBase, ctx.roomId)

    // Quick-create an ephemeral token
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/quick`, {
      x: 5,
      y: 5,
      name: 'Snapshot Target',
    })

    // Create and save archive
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`,
      { name: 'Restore Ephemeral Test' },
    )
    const archiveId = (archive as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)

    // Load the archive — ephemeral entities get recreated with new IDs
    const entityCreatedPromise = waitForSocketEvent<{ id: string; lifecycle: string }>(
      socket2,
      'entity:created',
    )

    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`)

    const payload = await entityCreatedPromise
    expect(payload.id).toBeTruthy()
    expect(payload.lifecycle).toBe('ephemeral')

    socket2.disconnect()
  })
})
