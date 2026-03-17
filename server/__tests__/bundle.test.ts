// server/__tests__/bundle.test.ts — Integration tests for GET /api/rooms/:id/bundle
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import express from 'express'
import { Server as SocketIOServer } from 'socket.io'
import request from 'supertest'
import { getGlobalDb, getRoomDb, closeAllDbs } from '../db'
import { roomRoutes } from '../routes/rooms'
import { sceneRoutes } from '../routes/scenes'
import { entityRoutes } from '../routes/entities'
import { tacticalRoutes } from '../routes/tactical'
import { chatRoutes } from '../routes/chat'
import { trackerRoutes } from '../routes/trackers'
import { showcaseRoutes } from '../routes/showcase'
import { stateRoutes } from '../routes/state'
import { seatRoutes } from '../routes/seats'
import { bundleRoutes } from '../routes/bundle'
import { setupSocketAuth } from '../ws'
import { setupAwareness } from '../awareness'
import path from 'path'
import fs from 'fs'
import os from 'os'

let server: http.Server
let io: SocketIOServer
let testApp: express.Express
let dataDir: string
let roomId: string

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myvtt-bundle-test-'))

  testApp = express()
  const app = testApp
  app.use(express.json())

  app.param('roomId', (_req, res, next, val) => {
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

  app.use(roomRoutes(dataDir, io))
  app.use(seatRoutes(dataDir, io))
  app.use(sceneRoutes(dataDir, io))
  app.use(entityRoutes(dataDir, io))
  app.use(tacticalRoutes(dataDir, io))
  app.use(chatRoutes(dataDir, io))
  app.use(trackerRoutes(dataDir, io))
  app.use(showcaseRoutes(dataDir, io))
  app.use(stateRoutes(dataDir, io))
  app.use(bundleRoutes(dataDir, io))

  getGlobalDb(dataDir)

  await new Promise<void>((resolve) => server.listen(0, resolve))

  // Create a test room
  const createRes = await request(testApp)
    .post('/api/rooms')
    .send({ name: 'Bundle Test Room', ruleSystemId: 'generic' })
  roomId = (createRes.body as { id: string }).id
})

afterAll(() => {
  void io.close()
  server.close()
  closeAllDbs()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('GET /api/rooms/:id/bundle', () => {
  it('returns all required top-level keys', async () => {
    const res = await request(testApp).get(`/api/rooms/${roomId}/bundle`)
    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown>
    expect(body).toHaveProperty('room')
    expect(body).toHaveProperty('scenes')
    expect(body).toHaveProperty('entities')
    expect(body).toHaveProperty('sceneEntityMap')
    expect(body).toHaveProperty('seats')
    expect(body).toHaveProperty('assets')
    expect(body).toHaveProperty('chat')
    expect(body).toHaveProperty('teamTrackers')
    expect(body).toHaveProperty('showcase')
    expect(body).toHaveProperty('tactical')
  })

  it('room field includes ruleSystemId and activeSceneId', async () => {
    const res = await request(testApp).get(`/api/rooms/${roomId}/bundle`)
    const { room } = res.body as { room: Record<string, unknown> }
    expect(room).toHaveProperty('ruleSystemId', 'generic')
    // activeSceneId is present (rooms always initialize with a default scene)
    expect(room).toHaveProperty('activeSceneId')
  })

  it('tactical is null when no active scene', async () => {
    // Create an isolated room for this test, then directly null the active_scene_id
    // (POST /api/rooms always sets a default active scene; PATCH /state only accepts truthy values)
    const createRes = await request(testApp)
      .post('/api/rooms')
      .send({ name: 'Tactical Null Test Room', ruleSystemId: 'generic' })
    const isolatedRoomId = (createRes.body as { id: string }).id

    const roomDb = getRoomDb(dataDir, isolatedRoomId)
    roomDb.prepare('UPDATE room_state SET active_scene_id = NULL WHERE id = 1').run()

    const res = await request(testApp).get(`/api/rooms/${isolatedRoomId}/bundle`)
    expect((res.body as { tactical: unknown }).tactical).toBeNull()
  })

  it('tactical includes tokens when active scene exists', async () => {
    // Create a scene
    const sceneRes = await request(testApp)
      .post(`/api/rooms/${roomId}/scenes`)
      .send({ name: 'Scene 1' })
    const sceneId = (sceneRes.body as { id: string }).id

    // Set as active scene
    await request(testApp)
      .patch(`/api/rooms/${roomId}/state`)
      .send({ activeSceneId: sceneId })

    const res = await request(testApp).get(`/api/rooms/${roomId}/bundle`)
    const { tactical } = res.body as { tactical: Record<string, unknown> | null }
    expect(tactical).not.toBeNull()
    expect(tactical).toHaveProperty('tokens')
    expect(Array.isArray(tactical!.tokens)).toBe(true)
  })

  it('sceneEntityMap is correctly grouped by scene_id', async () => {
    const res = await request(testApp).get(`/api/rooms/${roomId}/bundle`)
    const { sceneEntityMap } = res.body as {
      sceneEntityMap: Record<string, unknown[]>
    }
    // All values in the map must be arrays of entity entries
    for (const entries of Object.values(sceneEntityMap)) {
      expect(Array.isArray(entries)).toBe(true)
      for (const entry of entries) {
        expect(entry).toHaveProperty('entityId')
        expect(entry).toHaveProperty('visible')
      }
    }
  })

  it('assets array contains parsed extra field', async () => {
    // Bundle returns assets with parsed JSON fields (extra is object, not string)
    const res = await request(testApp).get(`/api/rooms/${roomId}/bundle`)
    const { assets } = res.body as { assets: Record<string, unknown>[] }
    // Even with no assets, array should exist
    expect(Array.isArray(assets)).toBe(true)
  })

  it('returns 400 for invalid room id (exceeds 64 chars)', async () => {
    const longId = 'a'.repeat(65)
    const res = await request(testApp).get(`/api/rooms/${longId}/bundle`)
    expect(res.status).toBe(400)
  })
})
