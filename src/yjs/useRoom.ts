import { useEffect, useState } from 'react'
import * as Y from 'yjs'

export interface RoomState {
  activeSceneId: string | null
}

function readRoom(yRoom: Y.Map<unknown>): RoomState {
  return {
    activeSceneId: (yRoom.get('activeSceneId') as string) ?? null,
  }
}

export function useRoom(yRoom: Y.Map<unknown>) {
  const [room, setRoom] = useState<RoomState>(() => readRoom(yRoom))

  useEffect(() => {
    setRoom(readRoom(yRoom))
    const observer = () => setRoom(readRoom(yRoom))
    yRoom.observe(observer)
    return () => yRoom.unobserve(observer)
  }, [yRoom])

  const setActiveScene = (sceneId: string) => {
    yRoom.set('activeSceneId', sceneId)
  }

  return {
    room,
    setActiveScene,
  }
}
