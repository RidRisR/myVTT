// server/__tests__/routes-errors.test.ts — Error path + edge case tests for REST API routes
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import express from 'express'
import { Server as SocketIOServer } from 'socket.io'
import { getGlobalDb, closeAllDbs } from '../db'
import { roomRoutes } from '../routes/rooms'
import { seatRoutes } from '../routes/seats'
import { sceneRoutes } from '../routes/scenes'
import { entityRoutes } from '../routes/entities'
import { archiveRoutes } from '../routes/archives'
import { tacticalRoutes } from '../routes/tactical'
import { chatRoutes } from '../routes/chat'
import { trackerRoutes } from '../routes/trackers'
import { showcaseRoutes } from '../routes/showcase'
import { stateRoutes } from '../routes/state'
import { setupSocketAuth } from '../ws'
import { setupAwareness } from '../awareness'
import path from 'path'
import fs from 'fs'
import os from 'os'

let server: http.Server
let io: SocketIOServer
let baseUrl: string
let dataDir: string

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myvtt-err-test-'))

  const app = express()
  app.use(express.json())

  app.param('roomId', (req, res, next, val) => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(val as string)) {
      res.status(400).json({ error: 'Invalid room ID' })
      return
    }
    next()
  })

  server = http.createServer(app)
  io = new SocketIOServer(server)

  setupSocketAuth(io, dataDir)
  setupAwareness(io)

  app.use(roomRoutes(dataDir))
  app.use(seatRoutes(dataDir, io))
  app.use(sceneRoutes(dataDir, io))
  app.use(entityRoutes(dataDir, io))
  app.use(archiveRoutes(dataDir, io))
  app.use(tacticalRoutes(dataDir, io))
  app.use(chatRoutes(dataDir, io))
  app.use(trackerRoutes(dataDir, io))
  app.use(showcaseRoutes(dataDir, io))
  app.use(stateRoutes(dataDir, io))

  getGlobalDb(dataDir)

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as { port: number }
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
})

afterAll(() => {
  void io.close()
  server.close()
  closeAllDbs()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

async function api(
  method: string,
  urlPath: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any
  return { status: res.status, data }
}

// Helper: create a room and return its ID
async function createRoom(name = 'Error Test Room') {
  const { data } = await api('POST', '/api/rooms', { name })
  return data.id as string
}

describe('Entity error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom()
  })

  it('PATCH /entities/:id with non-existent id returns 404', async () => {
    const { status, data } = await api('PATCH', `/api/rooms/${roomId}/entities/nonexistent-id`, {
      name: 'Ghost',
    })
    expect(status).toBe(404)
    expect(data.error).toBe('Entity not found')
  })

  it('deep merge PATCH on entity — nested 3-level ruleData merge', async () => {
    const { data: entity } = await api('POST', `/api/rooms/${roomId}/entities`, {
      name: 'Wizard',
      ruleData: {
        stats: {
          mental: { intelligence: 18, wisdom: 14 },
          physical: { strength: 8 },
        },
        level: 5,
      },
    })
    const entityId = entity.id

    // Patch a deeply nested field
    const { data: updated } = await api('PATCH', `/api/rooms/${roomId}/entities/${entityId}`, {
      ruleData: {
        stats: {
          mental: { wisdom: 16 },
        },
      },
    })

    // 3rd-level field updated
    expect(updated.ruleData.stats.mental.wisdom).toBe(16)
    // Sibling at 3rd level preserved
    expect(updated.ruleData.stats.mental.intelligence).toBe(18)
    // Sibling at 2nd level preserved
    expect(updated.ruleData.stats.physical.strength).toBe(8)
    // Top-level sibling preserved
    expect(updated.ruleData.level).toBe(5)
  })

  it('deep merge PATCH — array field overwrites (not merges)', async () => {
    const { data: entity } = await api('POST', `/api/rooms/${roomId}/entities`, {
      name: 'Fighter',
      ruleData: {
        attacks: ['sword', 'shield bash'],
        hp: { current: 30, max: 30 },
      },
    })
    const entityId = entity.id

    // Patch with a new array — should overwrite, not concat
    const { data: updated } = await api('PATCH', `/api/rooms/${roomId}/entities/${entityId}`, {
      ruleData: {
        attacks: ['greataxe'],
      },
    })

    expect(updated.ruleData.attacks).toEqual(['greataxe'])
    // Object sibling preserved
    expect(updated.ruleData.hp.current).toBe(30)
    expect(updated.ruleData.hp.max).toBe(30)
  })
})

describe('Scene delete cascade', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Cascade Room')
  })

  it('DELETE /scenes/:id cascades to scene_entities', async () => {
    // Create scene
    const { data: scene } = await api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Dungeon',
    })
    const sceneId = scene.id

    // Create non-persistent entity (so it doesn't auto-link)
    const { data: entity } = await api('POST', `/api/rooms/${roomId}/entities`, {
      name: 'Goblin',
      lifecycle: 'reusable',
    })
    const entityId = entity.id

    // Manually link entity to scene
    await api('POST', `/api/rooms/${roomId}/scenes/${sceneId}/entities/${entityId}`)

    // Verify link exists
    const { data: linked } = await api('GET', `/api/rooms/${roomId}/scenes/${sceneId}/entities`)
    expect((linked as { entityId: string }[]).map((r) => r.entityId)).toContain(entityId)

    // Delete scene
    await api('DELETE', `/api/rooms/${roomId}/scenes/${sceneId}`)

    // Entity still exists (only the link should be gone)
    const { status: entityStatus } = await api('GET', `/api/rooms/${roomId}/entities/${entityId}`)
    expect(entityStatus).toBe(200)

    // Create a new scene and verify no stale links for that entity
    const { data: scene2 } = await api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Forest',
    })
    const { data: linked2 } = await api('GET', `/api/rooms/${roomId}/scenes/${scene2.id}/entities`)
    expect((linked2 as { entityId: string }[]).map((r) => r.entityId)).not.toContain(entityId)
  })
})

describe('Archive gm_only filter', () => {
  let roomId: string
  let sceneId: string

  beforeAll(async () => {
    roomId = await createRoom('GM Filter Room')
    const { data: scene } = await api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Secret Scene',
    })
    sceneId = scene.id
  })

  it('GET archives filters gm_only for PL role', async () => {
    // Create a public archive
    await api('POST', `/api/rooms/${roomId}/scenes/${sceneId}/archives`, {
      name: 'Public Fight',
      gmOnly: false,
    })

    // Create a gm_only archive
    await api('POST', `/api/rooms/${roomId}/scenes/${sceneId}/archives`, {
      name: 'Secret Ambush',
      gmOnly: true,
    })

    // PL should not see gm_only archive
    const plList = await api('GET', `/api/rooms/${roomId}/scenes/${sceneId}/archives`, undefined, {
      'X-MyVTT-Role': 'PL',
    })
    const plNames = plList.data.map((e: { name: string }) => e.name)
    expect(plNames).toContain('Public Fight')
    expect(plNames).not.toContain('Secret Ambush')

    // GM should see all archives
    const gmList = await api('GET', `/api/rooms/${roomId}/scenes/${sceneId}/archives`, undefined, {
      'X-MyVTT-Role': 'GM',
    })
    const gmNames = gmList.data.map((e: { name: string }) => e.name)
    expect(gmNames).toContain('Public Fight')
    expect(gmNames).toContain('Secret Ambush')
  })
})

describe('Chat error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Chat Error Room')
  })

  it('POST /chat with empty content returns 400', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/chat`, {
      senderId: 's1',
      senderName: 'Player',
      senderColor: '#00ff00',
    })
    expect(status).toBe(400)
    expect(data.error).toBe('content is required')
  })

  it('POST /chat/retract/:id with non-existent id returns 404', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/chat/retract/nonexistent-msg`)
    expect(status).toBe(404)
    expect(data.error).toBe('Message not found')
  })

  it('POST /chat/retract/:id — create then retract message', async () => {
    // Create a message
    const { data: msg } = await api('POST', `/api/rooms/${roomId}/chat`, {
      senderId: 's1',
      senderName: 'GM',
      senderColor: '#ff0000',
      content: 'Oops, wrong message',
    })
    const msgId = msg.id

    // Retract it
    const { status, data } = await api('POST', `/api/rooms/${roomId}/chat/retract/${msgId}`)
    expect(status).toBe(200)
    expect(data.ok).toBe(true)

    // Verify it is gone from history
    const { data: history } = await api('GET', `/api/rooms/${roomId}/chat`)
    const ids = history.map((m: { id: string }) => m.id)
    expect(ids).not.toContain(msgId)
  })
})

describe('Showcase error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Showcase Error Room')
  })

  it('POST /showcase/:id/pin with non-existent id returns 404', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/showcase/nonexistent-item/pin`)
    expect(status).toBe(404)
    expect(data.error).toBe('Showcase item not found')
  })
})

describe('Seat error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Seat Error Room')
  })

  it('POST /seats/:id/claim — claim a seat updates user_id', async () => {
    const { data: seat } = await api('POST', `/api/rooms/${roomId}/seats`, {
      name: 'Player 1',
      color: '#00ff00',
      role: 'PL',
    })
    const seatId = seat.id

    const { data: claimed } = await api('POST', `/api/rooms/${roomId}/seats/${seatId}/claim`, {
      userId: 'user-abc-123',
    })
    expect(claimed.userId).toBe('user-abc-123')

    const { data: seats } = await api('GET', `/api/rooms/${roomId}/seats`)
    const found = seats.find((s: { id: string }) => s.id === seatId)
    expect(found.userId).toBe('user-abc-123')
  })

  it('POST /seats with missing fields returns 400', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/seats`, {
      name: 'Incomplete',
    })
    expect(status).toBe(400)
    expect(data.error).toContain('required')
  })

  it('PATCH /seats/:id with non-existent id returns 404', async () => {
    const { status, data } = await api('PATCH', `/api/rooms/${roomId}/seats/nonexistent-seat`, {
      name: 'Ghost',
    })
    expect(status).toBe(404)
    expect(data.error).toBe('Seat not found')
  })
})

describe('Scene error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Scene Error Room')
  })

  it('PATCH /scenes/:id with non-existent id returns 404', async () => {
    const { status, data } = await api('PATCH', `/api/rooms/${roomId}/scenes/nonexistent-scene`, {
      name: 'Ghost Scene',
    })
    expect(status).toBe(404)
    expect(data.error).toBe('Scene not found')
  })
})

describe('Tracker error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Tracker Error Room')
  })

  it('PATCH /team-trackers/:id with non-existent id returns 404', async () => {
    const { status, data } = await api(
      'PATCH',
      `/api/rooms/${roomId}/team-trackers/nonexistent-tracker`,
      { current: 5 },
    )
    expect(status).toBe(404)
    expect(data.error).toBe('Tracker not found')
  })
})

describe('Tactical token error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Tactical Token Error Room')
  })

  it('PATCH /tactical/tokens/:tokenId with non-existent token returns 404', async () => {
    // Need an active scene first
    const { data: scene } = await api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Error Scene',
    })
    await api('PATCH', `/api/rooms/${roomId}/state`, { activeSceneId: scene.id })

    const { status, data } = await api(
      'PATCH',
      `/api/rooms/${roomId}/tactical/tokens/nonexistent-token`,
      { x: 999 },
    )
    expect(status).toBe(404)
    expect(data.error).toBe('Token not found')
  })
})

describe('Showcase PATCH error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Showcase Patch Error Room')
  })

  it('PATCH /showcase/:id with non-existent id returns 404', async () => {
    const { status, data } = await api('PATCH', `/api/rooms/${roomId}/showcase/nonexistent-item`, {
      pinned: true,
    })
    expect(status).toBe(404)
    expect(data.error).toBe('Showcase item not found')
  })
})

describe('Archive error paths', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Archive Error Room')
  })

  it('PATCH /archives/:id with non-existent id returns 404', async () => {
    const { status, data } = await api('PATCH', `/api/rooms/${roomId}/archives/nonexistent-arc`, {
      name: 'Ghost Archive',
    })
    expect(status).toBe(404)
    expect(data.error).toBe('Archive not found')
  })
})
