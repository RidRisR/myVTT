// src/combat/useSceneTokens.ts
import { useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { MapToken } from '../shared/entityTypes'
import type { WorldMaps } from '../yjs/useWorld'

function getTokensMap(world: WorldMaps, sceneId: string | null): Y.Map<MapToken> | null {
  if (!sceneId) return null
  const sceneMap = world.scenes.get(sceneId)
  if (!(sceneMap instanceof Y.Map)) return null
  const tokens = sceneMap.get('tokens')
  if (tokens instanceof Y.Map) return tokens as Y.Map<MapToken>
  return null
}

export function useSceneTokens(world: WorldMaps, sceneId: string | null, yDoc: Y.Doc) {
  const [tokens, setTokens] = useState<MapToken[]>([])

  const tokensMap = getTokensMap(world, sceneId)

  useEffect(() => {
    if (!tokensMap) {
      setTokens([])
      return
    }
    const read = () => {
      const result: MapToken[] = []
      tokensMap.forEach(t => result.push(t))
      setTokens(result)
    }
    read()
    tokensMap.observe(read)
    return () => tokensMap.unobserve(read)
  }, [tokensMap])

  const addToken = useCallback((token: MapToken) => {
    tokensMap?.set(token.id, token)
  }, [tokensMap])

  const updateToken = useCallback((id: string, updates: Partial<MapToken>) => {
    if (!tokensMap) return
    const existing = tokensMap.get(id)
    if (existing) {
      tokensMap.set(id, { ...existing, ...updates })
    }
  }, [tokensMap])

  const deleteToken = useCallback((id: string) => {
    tokensMap?.delete(id)
  }, [tokensMap])

  const getToken = useCallback((id: string | null): MapToken | null => {
    if (!id || !tokensMap) return null
    return tokensMap.get(id) ?? null
  }, [tokensMap])

  return { tokens, addToken, updateToken, deleteToken, getToken }
}
