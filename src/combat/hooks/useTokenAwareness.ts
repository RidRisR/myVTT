import { useState, useEffect, useCallback } from 'react'
import { useWorldStore } from '../../stores/worldStore'
import { useIdentityStore } from '../../stores/identityStore'

interface RemoteTokenDrag {
  tokenId: string
  x: number
  y: number
  color: string
}

interface UseTokenAwarenessReturn {
  remoteTokenDrags: Map<string, RemoteTokenDrag>
  handleTokenDragMove: (tokenId: string, x: number, y: number) => void
  handleTokenDragEnd: () => void
}

export function useTokenAwareness(mySeatId: string): UseTokenAwarenessReturn {
  const socket = useWorldStore((s) => s._socket)
  const mySeat = useIdentityStore((s) => s.getMySeat())

  const [remoteTokenDrags, setRemoteTokenDrags] = useState<Map<string, RemoteTokenDrag>>(
    () => new Map(),
  )

  useEffect(() => {
    if (!socket) return
    const onDrag = (data: {
      tokenId: string
      x: number
      y: number
      color: string
      seatId: string
    }) => {
      if (data.seatId === mySeatId) return
      setRemoteTokenDrags((prev) => {
        const next = new Map(prev)
        next.set(data.seatId, data)
        return next
      })
    }
    const onDragEnd = ({ seatId }: { seatId: string }) => {
      if (seatId === mySeatId) return
      setRemoteTokenDrags((prev) => {
        if (!prev.has(seatId)) return prev
        const next = new Map(prev)
        next.delete(seatId)
        return next
      })
    }
    const onRemove = ({ seatId }: { seatId: string }) => {
      setRemoteTokenDrags((prev) => {
        if (!prev.has(seatId)) return prev
        const next = new Map(prev)
        next.delete(seatId)
        return next
      })
    }
    socket.on('awareness:tokenDrag', onDrag)
    socket.on('awareness:tokenDragEnd', onDragEnd)
    socket.on('awareness:remove', onRemove)
    return () => {
      socket.off('awareness:tokenDrag', onDrag)
      socket.off('awareness:tokenDragEnd', onDragEnd)
      socket.off('awareness:remove', onRemove)
    }
  }, [socket, mySeatId])

  const handleTokenDragMove = useCallback(
    (tokenId: string, x: number, y: number) => {
      if (!socket || !mySeat || !mySeatId) return
      socket.emit('awareness:tokenDrag', { tokenId, x, y, color: mySeat.color, seatId: mySeatId })
    },
    [socket, mySeat, mySeatId],
  )

  const handleTokenDragEnd = useCallback(() => {
    if (!socket || !mySeatId) return
    socket.emit('awareness:tokenDragEnd', { seatId: mySeatId })
  }, [socket, mySeatId])

  return { remoteTokenDrags, handleTokenDragMove, handleTokenDragEnd }
}
