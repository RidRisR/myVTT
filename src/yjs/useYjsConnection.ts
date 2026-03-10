import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'
import { WEBSOCKET_URL } from '../shared/config'

export function useYjsConnection(roomId: string) {
  const [yDoc] = useState(() => new Y.Doc())
  const [isLoading, setIsLoading] = useState(true)
  const [awareness, setAwareness] = useState<Awareness | null>(null)

  useEffect(() => {
    const wsProvider = new WebsocketProvider(WEBSOCKET_URL, roomId, yDoc)
    setAwareness(wsProvider.awareness)

    wsProvider.on('sync', (synced: boolean) => {
      if (synced) setIsLoading(false)
    })

    return () => {
      wsProvider.destroy()
      setAwareness(null)
    }
  }, [yDoc, roomId])

  return { yDoc, isLoading, awareness }
}
