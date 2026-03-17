const SERVER_PORT = import.meta.env.VITE_SERVER_PORT || '4444'
const PROXY_MODE = import.meta.env.VITE_PROXY_MODE === 'true'

export const API_BASE = import.meta.env.DEV && !PROXY_MODE ? `http://localhost:${SERVER_PORT}` : ''

export const WEBSOCKET_URL =
  import.meta.env.DEV && !PROXY_MODE
    ? `ws://localhost:${SERVER_PORT}`
    : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
