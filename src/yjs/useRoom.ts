import { useEffect, useState } from 'react'
import * as Y from 'yjs'

export interface RoomState {
  mode: 'scene' | 'combat'
  activeSceneId: string | null
  combatSceneId: string | null
}

function readRoom(yRoom: Y.Map<unknown>): RoomState {
  return {
    mode: (yRoom.get('mode') as RoomState['mode']) ?? 'scene',
    activeSceneId: (yRoom.get('activeSceneId') as string) ?? null,
    combatSceneId: (yRoom.get('combatSceneId') as string) ?? null,
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

  const setMode = (mode: 'scene' | 'combat') => {
    yRoom.doc?.transact(() => {
      yRoom.set('mode', mode)
      if (mode === 'combat' && !yRoom.get('combatSceneId')) {
        yRoom.set('combatSceneId', yRoom.get('activeSceneId'))
      }
    })
  }

  const setActiveScene = (sceneId: string) => {
    yRoom.set('activeSceneId', sceneId)
  }

  const setCombatScene = (sceneId: string) => {
    yRoom.set('combatSceneId', sceneId)
  }

  const enterCombat = (sceneId?: string) => {
    yRoom.doc?.transact(() => {
      yRoom.set('mode', 'combat')
      if (sceneId) {
        yRoom.set('combatSceneId', sceneId)
      } else if (!yRoom.get('combatSceneId')) {
        yRoom.set('combatSceneId', yRoom.get('activeSceneId'))
      }
    })
  }

  const exitCombat = () => {
    yRoom.set('mode', 'scene')
  }

  return {
    room,
    setMode,
    setActiveScene,
    setCombatScene,
    enterCombat,
    exitCombat,
  }
}
