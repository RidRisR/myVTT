// src/shared/hooks/useSocket.ts — Socket.io connection hook
import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_BASE } from '../config'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export function useSocket(roomId: string) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const s = io(API_BASE || window.location.origin, {
      query: { roomId },
    })

    s.on('connect', () => setConnectionStatus('connected'))
    s.on('disconnect', () => setConnectionStatus('disconnected'))

    s.io.on('reconnect', () => {
      setConnectionStatus('connected')
      // reinit triggered by connectionStatus change in App.tsx
    })

    socketRef.current = s
    setSocket(s)

    return () => {
      s.disconnect()
      socketRef.current = null
      setSocket(null)
    }
  }, [roomId])

  return { socket, connectionStatus }
}
