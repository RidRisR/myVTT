import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { CombatToken } from './combatTypes'

function readTokens(yTokens: Y.Map<CombatToken>): CombatToken[] {
  const tokens: CombatToken[] = []
  yTokens.forEach((token) => tokens.push(token))
  return tokens
}

export function useCombatTokens(yDoc: Y.Doc) {
  const yTokens = yDoc.getMap<CombatToken>('combat_tokens')
  const [tokens, setTokens] = useState<CombatToken[]>(() => readTokens(yTokens))

  useEffect(() => {
    setTokens(readTokens(yTokens))
    const observer = () => setTokens(readTokens(yTokens))
    yTokens.observe(observer)
    return () => yTokens.unobserve(observer)
  }, [yTokens])

  const addToken = (token: CombatToken) => {
    yTokens.set(token.id, token)
  }

  const updateToken = (id: string, updates: Partial<CombatToken>) => {
    const existing = yTokens.get(id)
    if (existing) {
      yTokens.set(id, { ...existing, ...updates })
    }
  }

  const deleteToken = (id: string) => {
    yTokens.delete(id)
  }

  const getToken = (id: string | null): CombatToken | null => {
    if (!id) return null
    return yTokens.get(id) ?? null
  }

  return { tokens, addToken, updateToken, deleteToken, getToken }
}
