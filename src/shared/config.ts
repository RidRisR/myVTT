const SERVER_PORT = import.meta.env.VITE_SERVER_PORT || '4444'

export const API_BASE = import.meta.env.DEV ? `http://localhost:${SERVER_PORT}` : ''

export const WEBSOCKET_URL = import.meta.env.DEV
  ? `ws://localhost:${SERVER_PORT}`
  : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
