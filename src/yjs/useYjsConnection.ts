import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'
import { WEBSOCKET_URL } from '../shared/config'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export function useYjsConnection(roomId: string) {
  const [yDoc] = useState(() => new Y.Doc())
  const [isLoading, setIsLoading] = useState(true)
  const [awareness, setAwareness] = useState<Awareness | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    const wsProvider = new WebsocketProvider(WEBSOCKET_URL, roomId, yDoc)
    setAwareness(wsProvider.awareness)

    wsProvider.on('sync', (synced: boolean) => {
      if (synced) setIsLoading(false)
    })

    wsProvider.on('status', (event: { status: ConnectionStatus }) => {
      setConnectionStatus(event.status)
    })

    return () => {
      wsProvider.destroy()
      setAwareness(null)
    }
  }, [yDoc, roomId])

  return { yDoc, isLoading, awareness, connectionStatus }
}
