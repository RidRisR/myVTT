import http from 'http'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils')
const { LeveldbPersistence } = require('y-leveldb')
const Y = require('yjs')
const { Server: WSServer } = require('ws')

const PORT = parseInt(process.env.PORT || '4444')
const HOST = process.env.HOST || 'localhost'
const PERSISTENCE_DIR = process.env.YPERSISTENCE || './db'

// Set up LevelDB persistence
const ldb = new LeveldbPersistence(PERSISTENCE_DIR)

setPersistence({
  provider: ldb,
  bindState: async (docName, ydoc) => {
    const persistedYdoc = await ldb.getYDoc(docName)
    const newUpdates = Y.encodeStateAsUpdate(persistedYdoc)
    Y.applyUpdate(ydoc, newUpdates)
    ydoc.on('update', (update) => {
      ldb.storeUpdate(docName, update)
    })
  },
  writeState: async (_docName, _ydoc) => {},
})

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('y-websocket server running')
})

const wss = new WSServer({ server })

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req)
})

server.listen(PORT, HOST, () => {
  console.log(`y-websocket server running on ws://${HOST}:${PORT}`)
  console.log(`Persistence directory: ${PERSISTENCE_DIR}`)
})
