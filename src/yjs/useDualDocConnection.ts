import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'
import { WEBSOCKET_URL } from '../shared/config'

export function useDualDocConnection(roomId: string, token: string | null) {
  const [publicDoc] = useState(() => new Y.Doc())
  const [secretDoc] = useState(() => new Y.Doc())
  const [isLoading, setIsLoading] = useState(true)
  const [awareness, setAwareness] = useState<Awareness | null>(null)

  const isGM = token?.startsWith('gm_') ?? false

  useEffect(() => {
    const params: Record<string, string> = {}
    if (token) params.token = token

    const pubProvider = new WebsocketProvider(WEBSOCKET_URL, `${roomId}:public`, publicDoc, {
      params,
    })
    setAwareness(pubProvider.awareness)

    let secProvider: WebsocketProvider | null = null
    let pubSynced = false
    let secSynced = !isGM

    const checkReady = () => {
      if (pubSynced && secSynced) setIsLoading(false)
    }

    pubProvider.on('sync', (synced: boolean) => {
      if (synced) {
        pubSynced = true
        checkReady()
      }
    })

    if (isGM) {
      secProvider = new WebsocketProvider(WEBSOCKET_URL, `${roomId}:secret`, secretDoc, { params })
      secProvider.on('sync', (synced: boolean) => {
        if (synced) {
          secSynced = true
          checkReady()
        }
      })
    }

    return () => {
      pubProvider.destroy()
      secProvider?.destroy()
      setAwareness(null)
    }
  }, [publicDoc, secretDoc, roomId, token, isGM])

  return {
    publicDoc,
    secretDoc: isGM ? secretDoc : null,
    isLoading,
    awareness,
    isGM,
  }
}
