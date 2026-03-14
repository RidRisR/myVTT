// server/__tests__/routes.test.ts — Integration tests for all REST API routes
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import express from 'express'
import { Server as SocketIOServer } from 'socket.io'
import request from 'supertest'
import { getGlobalDb, closeAllDbs } from '../db'
import { roomRoutes } from '../routes/rooms'
import { seatRoutes } from '../routes/seats'
import { sceneRoutes } from '../routes/scenes'
import { entityRoutes } from '../routes/entities'
import { encounterRoutes } from '../routes/encounters'
import { combatRoutes } from '../routes/combat'
import { chatRoutes } from '../routes/chat'
import { trackerRoutes } from '../routes/trackers'
import { showcaseRoutes } from '../routes/showcase'
import { stateRoutes } from '../routes/state'
import { assetRoutes } from '../routes/assets'
import { setupSocketAuth } from '../ws'
import { setupAwareness } from '../awareness'
import path from 'path'
import fs from 'fs'
import os from 'os'

let server: http.Server
let io: SocketIOServer
let baseUrl: string
let dataDir: string
let testApp: express.Express

beforeAll(async () => {
  // Use temp directory for test data
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myvtt-test-'))

  testApp = express()
  const app = testApp
  app.use(express.json())

  // Room ID validation
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
  app.use(encounterRoutes(dataDir, io))
  app.use(combatRoutes(dataDir, io))
  app.use(chatRoutes(dataDir, io))
  app.use(trackerRoutes(dataDir, io))
  app.use(showcaseRoutes(dataDir, io))
  app.use(stateRoutes(dataDir, io))
  app.use(assetRoutes(dataDir, io))

  // Initialize global DB
  getGlobalDb(dataDir)

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as { port: number }
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
})

afterAll(async () => {
  io.close()
  server.close()
  closeAllDbs()
  // Cleanup temp dir
  fs.rmSync(dataDir, { recursive: true, force: true })
})

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  return { status: res.status, data }
}

describe('Rooms API', () => {
  it('creates and lists rooms', async () => {
    const { status, data } = await api('POST', '/api/rooms', { name: 'Test Room' })
    expect(status).toBe(201)
    expect(data.name).toBe('Test Room')
    expect(data.id).toBeTruthy()

    const list = await api('GET', '/api/rooms')
    expect(list.data.length).toBeGreaterThan(0)
    expect(list.data.some((r: { name: string }) => r.name === 'Test Room')).toBe(true)
  })

  it('rejects room creation without name', async () => {
    const { status } = await api('POST', '/api/rooms', {})
    expect(status).toBe(400)
  })
})

describe('Full room lifecycle', () => {
  let roomId: string

  it('creates a room', async () => {
    const { data } = await api('POST', '/api/rooms', { name: 'Lifecycle Room' })
    roomId = data.id
    expect(roomId).toBeTruthy()
  })

  // ── Seats ──
  it('creates a seat', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/seats`, {
      name: 'GM',
      color: '#ff6600',
      role: 'GM',
    })
    expect(status).toBe(201)
    expect(data.name).toBe('GM')
    expect(data.role).toBe('GM')
  })

  it('lists seats', async () => {
    const { data } = await api('GET', `/api/rooms/${roomId}/seats`)
    expect(data.length).toBe(1)
    expect(data[0].name).toBe('GM')
  })

  // ── Scenes ──
  let sceneId: string
  it('creates a scene', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Tavern',
      atmosphere: { imageUrl: 'tavern.jpg', particlePreset: 'embers' },
    })
    expect(status).toBe(201)
    expect(data.name).toBe('Tavern')
    expect(data.atmosphere.imageUrl).toBe('tavern.jpg')
    expect(data.gmOnly).toBe(false)
    sceneId = data.id
  })

  it('updates a scene with deep merge on atmosphere', async () => {
    const { data } = await api('PATCH', `/api/rooms/${roomId}/scenes/${sceneId}`, {
      atmosphere: { ambientPreset: 'forest' },
    })
    expect(data.atmosphere.imageUrl).toBe('tavern.jpg')
    expect(data.atmosphere.ambientPreset).toBe('forest')
    expect(data.atmosphere.particlePreset).toBe('embers')
  })

  // ── Entities ──
  let entityId: string
  it('creates an entity', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/entities`, {
      name: 'Hero',
      color: '#00ff00',
      ruleData: { hp: { current: 20, max: 20 }, str: 14 },
      lifecycle: 'persistent',
    })
    expect(status).toBe(201)
    expect(data.name).toBe('Hero')
    expect(data.lifecycle).toBe('persistent')
    expect(data.ruleData.hp.current).toBe(20)
    entityId = data.id
  })

  it('persistent entity auto-linked to existing scene', async () => {
    const { data } = await api('GET', `/api/rooms/${roomId}/scenes/${sceneId}/entities`)
    expect((data as { entityId: string }[]).map((r) => r.entityId)).toContain(entityId)
  })

  it('updates entity with deep merge on ruleData', async () => {
    const { data } = await api('PATCH', `/api/rooms/${roomId}/entities/${entityId}`, {
      ruleData: { hp: { current: 15 } },
    })
    expect(data.ruleData.hp.current).toBe(15)
    expect(data.ruleData.hp.max).toBe(20) // preserved
    expect(data.ruleData.str).toBe(14) // preserved
  })

  // ── Encounters + Combat ──
  let encounterId: string
  it('creates an encounter', async () => {
    const { status, data } = await api(
      'POST',
      `/api/rooms/${roomId}/scenes/${sceneId}/encounters`,
      {
        name: 'Bar Fight',
        mapUrl: 'tavern-map.jpg',
        mapWidth: 1000,
        mapHeight: 800,
        grid: { size: 50, snap: true, visible: true },
        tokens: { t1: { id: 't1', x: 100, y: 200, size: 1, label: 'Goblin' } },
      },
    )
    expect(status).toBe(201)
    expect(data.name).toBe('Bar Fight')
    expect(data.grid.size).toBe(50)
    encounterId = data.id
  })

  it('activates encounter → combat state populated', async () => {
    const { data } = await api('POST', `/api/rooms/${roomId}/encounters/${encounterId}/activate`)
    expect(data.mapUrl).toBe('tavern-map.jpg')
    expect(data.tokens.t1.label).toBe('Goblin')

    // Room state updated
    const state = await api('GET', `/api/rooms/${roomId}/state`)
    expect(state.data.activeEncounterId).toBe(encounterId)
  })

  it('adds a combat token', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/combat/tokens`, {
      id: 't2',
      x: 300,
      y: 400,
      size: 2,
      entityId: entityId,
    })
    expect(status).toBe(201)
    expect(data.id).toBe('t2')
    expect(data.entityId).toBe(entityId)
  })

  it('updates a combat token', async () => {
    const { data } = await api('PATCH', `/api/rooms/${roomId}/combat/tokens/t2`, {
      x: 350,
      y: 450,
    })
    expect(data.x).toBe(350)
    expect(data.entityId).toBe(entityId)
  })

  it('gets full combat state', async () => {
    const { data } = await api('GET', `/api/rooms/${roomId}/combat`)
    expect(data.tokens.t1).toBeTruthy()
    expect(data.tokens.t2).toBeTruthy()
    expect(data.tokens.t2.x).toBe(350)
  })

  it('ends combat — deactivates session but preserves combat state', async () => {
    await api('POST', `/api/rooms/${roomId}/combat/end`)
    const state = await api('GET', `/api/rooms/${roomId}/state`)
    expect(state.data.activeEncounterId).toBeNull()

    // Combat state (map, tokens) should be preserved for next session
    const combat = await api('GET', `/api/rooms/${roomId}/combat`)
    expect(combat.data.mapUrl).toBe('tavern-map.jpg')
    expect(Object.keys(combat.data.tokens)).toHaveLength(2)
  })

  // ── Chat ──
  it('sends a text message', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/chat`, {
      senderId: 's1',
      senderName: 'GM',
      senderColor: '#ff0000',
      content: 'Hello adventurers!',
    })
    expect(status).toBe(201)
    expect(data.type).toBe('text')
    expect(data.content).toBe('Hello adventurers!')
  })

  it('retrieves chat history', async () => {
    const { data } = await api('GET', `/api/rooms/${roomId}/chat`)
    expect(data.length).toBe(1)
    expect(data[0].senderName).toBe('GM')
  })

  // ── Team Trackers ──
  let trackerId: string
  it('creates a tracker', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/team-trackers`, {
      label: 'Inspiration',
      current: 3,
      max: 5,
      color: '#ffd700',
    })
    expect(status).toBe(201)
    expect(data.label).toBe('Inspiration')
    trackerId = data.id
  })

  it('updates a tracker', async () => {
    const { data } = await api('PATCH', `/api/rooms/${roomId}/team-trackers/${trackerId}`, {
      current: 4,
    })
    expect(data.current).toBe(4)
    expect(data.max).toBe(5)
  })

  // ── Showcase ──
  let showcaseId: string
  it('creates a showcase item', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/showcase`, {
      type: 'image',
      data: { imageUrl: 'treasure.jpg', title: 'Ancient Map' },
    })
    expect(status).toBe(201)
    expect(data.type).toBe('image')
    expect(data.data.title).toBe('Ancient Map')
    expect(data.pinned).toBe(false)
    showcaseId = data.id
  })

  it('pins a showcase item', async () => {
    const { data } = await api('PATCH', `/api/rooms/${roomId}/showcase/${showcaseId}`, {
      pinned: true,
    })
    expect(data.pinned).toBe(true)
  })

  it('clears showcase', async () => {
    await api('DELETE', `/api/rooms/${roomId}/showcase`)
    const { data } = await api('GET', `/api/rooms/${roomId}/showcase`)
    expect(data).toHaveLength(0)
  })

  // ── Room State ──
  it('updates room state', async () => {
    const { data } = await api('PATCH', `/api/rooms/${roomId}/state`, {
      activeSceneId: sceneId,
    })
    expect(data.activeSceneId).toBe(sceneId)
  })

  // ── Assets: upload → serve → delete round-trip ──
  // Regression test for Bug #4 (two-step upload) and Bug #5 (sendFile relative path)
  it('uploads a file via FormData and serves it back', async () => {
    const fileContent = Buffer.from('test-image-binary-data-12345')

    // Upload via supertest (proper multipart handling)
    const uploadRes = await request(testApp)
      .post(`/api/rooms/${roomId}/assets`)
      .attach('file', fileContent, { filename: 'test.png', contentType: 'image/png' })
      .field('name', 'Test Image')
      .field('type', 'image')
    expect(uploadRes.status).toBe(201)
    expect(uploadRes.body.id).toBeTruthy()
    expect(uploadRes.body.url).toContain('/uploads/')
    expect(uploadRes.body.name).toBe('Test Image')
    expect(uploadRes.body.type).toBe('image')

    const assetUrl = uploadRes.body.url
    const assetId = uploadRes.body.id

    // Serve the uploaded file — verifies sendFile works with absolute path (Bug #5)
    const serveRes = await request(testApp).get(assetUrl)
    expect(serveRes.status).toBe(200)
    expect(Buffer.from(serveRes.body).equals(fileContent)).toBe(true)

    // List assets — should include the uploaded asset
    const listRes = await api('GET', `/api/rooms/${roomId}/assets`)
    expect(listRes.data.some((a: { id: string }) => a.id === assetId)).toBe(true)

    // Delete the asset — should clean up disk file
    const delRes = await api('DELETE', `/api/rooms/${roomId}/assets/${assetId}`)
    expect(delRes.status).toBe(200)

    // File should no longer be served
    const goneRes = await request(testApp).get(assetUrl)
    expect(goneRes.status).toBe(404)
  })

  // ── Scene ID passthrough (regression: C1) ──
  it('creates scene with client-provided ID', async () => {
    const clientId = 'client-scene-id-123'
    const { status, data } = await api('POST', `/api/rooms/${roomId}/scenes`, {
      id: clientId,
      name: 'Client ID Scene',
    })
    expect(status).toBe(201)
    expect(data.id).toBe(clientId)
  })

  it('creates scene with server-generated ID when no body.id', async () => {
    const { status, data } = await api('POST', `/api/rooms/${roomId}/scenes`, {
      name: 'Server ID Scene',
    })
    expect(status).toBe(201)
    expect(data.id).toBeTruthy()
    expect(data.id).not.toBe('')
  })

  // Full scene ID → activeSceneId round-trip (regression: C1 end-to-end)
  it('scene with client ID can be set as activeSceneId', async () => {
    const sid = 'roundtrip-scene-' + Date.now()
    await api('POST', `/api/rooms/${roomId}/scenes`, { id: sid, name: 'RT Scene' })
    await api('PATCH', `/api/rooms/${roomId}/state`, { activeSceneId: sid })

    const { data } = await api('GET', `/api/rooms/${roomId}/state`)
    expect(data.activeSceneId).toBe(sid)
  })

  // Persistent entity auto-linking atomicity (regression: M3)
  it('new scene auto-links all persistent entities', async () => {
    const ids = ['pers-a', 'pers-b', 'pers-c']
    for (const id of ids) {
      await api('POST', `/api/rooms/${roomId}/entities`, {
        id,
        name: `Persistent ${id}`,
        lifecycle: 'persistent',
      })
    }
    const newSceneId = 'auto-link-scene'
    await api('POST', `/api/rooms/${roomId}/scenes`, { id: newSceneId, name: 'Auto Link' })
    const { data: linkedEntries } = await api(
      'GET',
      `/api/rooms/${roomId}/scenes/${newSceneId}/entities`,
    )
    const linkedIds = (linkedEntries as { entityId: string }[]).map((r) => r.entityId)
    for (const id of ids) {
      expect(linkedIds).toContain(id)
    }
  })

  // ── Cleanup ──
  it('deletes the room', async () => {
    const { data } = await api('DELETE', `/api/rooms/${roomId}`)
    expect(data.ok).toBe(true)
  })
})

// ── Room DELETE disk cleanup (regression: H1) ──
describe('Room DELETE disk cleanup', () => {
  it('deletes room directory from disk', async () => {
    const { data: room } = await api('POST', '/api/rooms', { name: 'Disk Cleanup Room' })
    const rid = room.id
    const roomDir = path.join(dataDir, 'rooms', rid)

    expect(fs.existsSync(roomDir)).toBe(true)

    const { data } = await api('DELETE', `/api/rooms/${rid}`)
    expect(data.ok).toBe(true)

    expect(fs.existsSync(roomDir)).toBe(false)
  })
})
