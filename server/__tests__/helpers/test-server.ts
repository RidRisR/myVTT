// server/__tests__/helpers/test-server.ts — Shared test infrastructure
// Creates a real Express+Socket.io server with ephemeral SQLite for integration tests.
import http from 'http'
import express from 'express'
import { Server as SocketIOServer } from 'socket.io'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'
import { getGlobalDb, closeAllDbs } from '../../db'
import { roomRoutes } from '../../routes/rooms'
import { seatRoutes } from '../../routes/seats'
import { sceneRoutes } from '../../routes/scenes'
import { entityRoutes } from '../../routes/entities'
import { archiveRoutes } from '../../routes/archives'
import { tacticalRoutes } from '../../routes/tactical'
import { chatRoutes } from '../../routes/chat'
import { trackerRoutes } from '../../routes/trackers'
import { showcaseRoutes } from '../../routes/showcase'
import { stateRoutes } from '../../routes/state'
import { assetRoutes } from '../../routes/assets'
import { setupSocketAuth } from '../../ws'
import { setupAwareness } from '../../awareness'
import path from 'path'
import fs from 'fs'
import os from 'os'

export interface TestContext {
  /** Base URL of the test server, e.g. http://127.0.0.1:12345 */
  apiBase: string
  /** Room ID created for this test context */
  roomId: string
  /** Raw HTTP helper — bypasses stores, useful for verification GETs */
  api: (method: string, path: string, body?: unknown) => Promise<{ status: number; data: unknown }>
  /** Socket.io client connected to the test room */
  socket: ClientSocket
  /** Tear down server, socket, and temp directory */
  cleanup: () => Promise<void>
}

/**
 * Spin up a real test server with an ephemeral SQLite database.
 * Creates a room and connects a Socket.io client to it.
 */
export async function setupTestRoom(roomName = 'test-room'): Promise<TestContext> {
  // 1. Temp data directory
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myvtt-integ-'))

  // 2. Build Express app (mirrors routes.test.ts boilerplate)
  const app = express()
  app.use(express.json())

  app.param('roomId', (_req, res, next, val) => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(val as string)) {
      res.status(400).json({ error: 'Invalid room ID' })
      return
    }
    next()
  })

  const server = http.createServer(app)
  const io = new SocketIOServer(server)

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
  app.use(assetRoutes(dataDir, io))

  getGlobalDb(dataDir)

  // 3. Listen on random port
  const apiBase = await new Promise<string>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as { port: number }
      resolve(`http://127.0.0.1:${addr.port}`)
    })
  })

  // 4. Raw HTTP helper
  const api = async (method: string, reqPath: string, body?: unknown) => {
    const res = await fetch(`${apiBase}${reqPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return { status: res.status, data }
  }

  // 5. Create room
  const roomRes = await api('POST', '/api/rooms', { name: roomName })
  const roomId = (roomRes.data as { id: string }).id

  // 6. Connect Socket.io client (roomId via handshake query — see server/ws.ts)
  const socket = ioClient(apiBase, {
    transports: ['websocket'],
    forceNew: true,
    query: { roomId },
  })
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => {
      resolve()
    })
    socket.on('connect_error', reject)
    setTimeout(() => {
      reject(new Error('Socket connect timeout'))
    }, 5000)
  })

  // 7. Cleanup function
  const cleanup = async () => {
    socket.disconnect()
    void io.close()
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve()
      }),
    )
    closeAllDbs()
    fs.rmSync(dataDir, { recursive: true, force: true })
  }

  return { apiBase, roomId, api, socket, cleanup }
}

/**
 * Wait for a specific Socket.io event to fire.
 */
export function waitForSocketEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeout = 3000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`Timeout waiting for socket event: ${event}`))
    }, timeout)
    const handler = (data: T) => {
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(data)
    }
    socket.on(event, handler)
  })
}

/**
 * Create a second Socket.io client connected to the same room.
 * Useful for multi-client broadcast tests.
 */
export async function connectSecondClient(apiBase: string, roomId: string): Promise<ClientSocket> {
  const socket = ioClient(apiBase, {
    transports: ['websocket'],
    forceNew: true,
    query: { roomId },
  })
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => {
      resolve()
    })
    socket.on('connect_error', reject)
    setTimeout(() => {
      reject(new Error('Socket connect timeout'))
    }, 5000)
  })
  return socket
}
