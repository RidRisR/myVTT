// server/__tests__/routes-missing.test.ts — Tests for newly implemented endpoints
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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myvtt-missing-test-'))

  const app = express()
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

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
async function api<T = Record<string, unknown>>(
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json()) as T
  return { status: res.status, data }
}

async function createRoom(name = 'Missing Endpoint Room') {
  const { data } = await api('POST', '/api/rooms', { name })
  return data.id as string
}

describe('POST /seats/:id/claim', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Claim Test Room')
  })

  it('creates a seat, claims it, and verifies userId is set', async () => {
    // Create seat
    const { status: createStatus, data: seat } = await api('POST', `/api/rooms/${roomId}/seats`, {
      name: 'Ranger',
      color: '#228b22',
      role: 'PL',
    })
    expect(createStatus).toBe(201)
    expect(seat.userId).toBeNull()

    // Claim it
    const { status: claimStatus, data: claimed } = await api(
      'POST',
      `/api/rooms/${roomId}/seats/${String(seat.id)}/claim`,
      { userId: 'player-42' },
    )
    expect(claimStatus).toBe(200)
    expect(claimed.userId).toBe('player-42')

    // Verify via list
    const { data: seats } = await api<Array<{ id: string; userId: string | null }>>(
      'GET',
      `/api/rooms/${roomId}/seats`,
    )
    const found = seats.find((s) => s.id === (seat.id as string))
    expect(found).toBeDefined()
    expect(found!.userId).toBe('player-42')
  })

  it('returns 404 for non-existent seat', async () => {
    const { status } = await api('POST', `/api/rooms/${roomId}/seats/no-such-seat/claim`, {
      userId: 'user-1',
    })
    expect(status).toBe(404)
  })
})

describe('POST /chat/retract/:id', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Retract Test Room')
  })

  it('creates a message, retracts it, and verifies it is gone from GET', async () => {
    // Send a message
    const { status: sendStatus, data: msg } = await api('POST', `/api/rooms/${roomId}/chat`, {
      senderId: 's-gm',
      senderName: 'GM',
      senderColor: '#ff6600',
      content: 'This message will be retracted',
    })
    expect(sendStatus).toBe(201)
    expect(msg.id).toBeTruthy()

    // Verify it appears in history
    const { data: before } = await api<Array<{ id: string }>>('GET', `/api/rooms/${roomId}/chat`)
    expect(before.some((m) => m.id === (msg.id as string))).toBe(true)

    // Retract
    const { status: retractStatus, data: retractData } = await api(
      'POST',
      `/api/rooms/${roomId}/chat/retract/${msg.id as string}`,
    )
    expect(retractStatus).toBe(200)
    expect(retractData.ok).toBe(true)

    // Verify gone
    const { data: after } = await api<Array<{ id: string }>>('GET', `/api/rooms/${roomId}/chat`)
    expect(after.some((m) => m.id === (msg.id as string))).toBe(false)
  })

  it('returns 404 for non-existent message', async () => {
    const { status } = await api('POST', `/api/rooms/${roomId}/chat/retract/fake-msg-id`)
    expect(status).toBe(404)
  })
})

describe('POST /showcase/:id/pin + POST /showcase/unpin', () => {
  let roomId: string

  beforeAll(async () => {
    roomId = await createRoom('Showcase Pin Room')
  })

  it('creates item, pins it, and verifies pinned=true in GET', async () => {
    // Create showcase item
    const { status: createStatus, data: item } = await api(
      'POST',
      `/api/rooms/${roomId}/showcase`,
      { type: 'image', data: { imageUrl: 'map.png', title: 'Battle Map' } },
    )
    expect(createStatus).toBe(201)
    expect(item.pinned).toBe(false)

    // Pin it
    const { status: pinStatus, data: pinData } = await api(
      'POST',
      `/api/rooms/${roomId}/showcase/${item.id as string}/pin`,
    )
    expect(pinStatus).toBe(200)
    expect(pinData.ok).toBe(true)

    // Verify pinned=true via GET
    const { data: items } = await api<Array<{ id: string; pinned: boolean }>>(
      'GET',
      `/api/rooms/${roomId}/showcase`,
    )
    const found = items.find((i) => i.id === (item.id as string))
    expect(found).toBeDefined()
    expect(found!.pinned).toBe(true)
  })

  it('returns 404 when pinning non-existent item', async () => {
    const { status } = await api('POST', `/api/rooms/${roomId}/showcase/does-not-exist/pin`)
    expect(status).toBe(404)
  })

  it('pins item then unpins all, verifies pinned=false', async () => {
    // Create and pin an item
    const { data: item } = await api('POST', `/api/rooms/${roomId}/showcase`, {
      type: 'image',
      data: { imageUrl: 'handout.jpg', title: 'Letter' },
    })
    await api('POST', `/api/rooms/${roomId}/showcase/${item.id as string}/pin`)

    // Verify pinned
    const { data: beforeUnpin } = await api<Array<{ id: string; pinned: boolean }>>(
      'GET',
      `/api/rooms/${roomId}/showcase`,
    )
    const pinnedItem = beforeUnpin.find((i) => i.id === (item.id as string))
    expect(pinnedItem!.pinned).toBe(true)

    // Unpin all
    const { status: unpinStatus, data: unpinData } = await api(
      'POST',
      `/api/rooms/${roomId}/showcase/unpin`,
    )
    expect(unpinStatus).toBe(200)
    expect(unpinData.ok).toBe(true)

    // Verify all unpinned
    const { data: afterUnpin } = await api<Array<{ pinned: boolean }>>(
      'GET',
      `/api/rooms/${roomId}/showcase`,
    )
    for (const i of afterUnpin) {
      expect(i.pinned).toBe(false)
    }
  })
})
