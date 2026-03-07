import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'

const WEBSOCKET_URL = import.meta.env.DEV
  ? 'ws://localhost:4444'
  : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
const ROOM_NAME = 'vtt-room-1'

export function useYjsConnection() {
  const [yDoc] = useState(() => new Y.Doc())
  const [isLoading, setIsLoading] = useState(true)
  const [awareness, setAwareness] = useState<Awareness | null>(null)

  useEffect(() => {
    const wsProvider = new WebsocketProvider(WEBSOCKET_URL, ROOM_NAME, yDoc)
    setAwareness(wsProvider.awareness)

    wsProvider.on('sync', (synced: boolean) => {
      if (synced) setIsLoading(false)
    })

    return () => {
      wsProvider.destroy()
      setAwareness(null)
    }
  }, [yDoc])

  return { yDoc, isLoading, awareness }
}
