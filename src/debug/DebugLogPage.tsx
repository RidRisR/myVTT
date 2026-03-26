// src/debug/DebugLogPage.tsx — DEV-only wrapper: connects socket + renders DebugLogPanel
import { useEffect, useState, useRef } from 'react'
import { useSocket } from '../hooks/useSocket'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { DebugLogPanel } from './DebugLogPanel'

export default function DebugLogPage({ roomId }: { roomId: string }) {
  const { socket } = useSocket(roomId)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const initWorld = useWorldStore((s) => s.init)
  const initIdentity = useIdentityStore((s) => s.init)

  useEffect(() => {
    if (!socket) return
    cancelledRef.current = false
    let cleanupWorld: (() => void) | undefined
    let cleanupIdentity: (() => void) | undefined

    void (async () => {
      try {
        const [wc, ic] = await Promise.all([
          initWorld(roomId, socket),
          initIdentity(roomId, socket),
        ])
        if (cancelledRef.current) {
          wc()
          ic()
          return
        }
        cleanupWorld = wc
        cleanupIdentity = ic
        setReady(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed')
      }
    })()

    return () => {
      cancelledRef.current = true
      cleanupWorld?.()
      cleanupIdentity?.()
      setReady(false)
    }
  }, [socket, roomId, initWorld, initIdentity])

  if (error) {
    return (
      <div
        style={{
          padding: 32,
          color: '#f87171',
          fontFamily: 'monospace',
          background: '#0f0f19',
          height: '100vh',
        }}
      >
        Debug: failed to connect to room {roomId} — {error}
      </div>
    )
  }

  if (!ready) {
    return (
      <div
        style={{
          padding: 32,
          color: '#888',
          fontFamily: 'monospace',
          background: '#0f0f19',
          height: '100vh',
        }}
      >
        Connecting to room {roomId}…
      </div>
    )
  }

  return <DebugLogPanel roomId={roomId} />
}
