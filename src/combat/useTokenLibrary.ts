import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { TokenBlueprint } from './combatTypes'

function readBlueprints(yBlueprints: Y.Map<TokenBlueprint>): TokenBlueprint[] {
  const list: TokenBlueprint[] = []
  yBlueprints.forEach((bp) => list.push(bp))
  list.sort((a, b) => a.name.localeCompare(b.name))
  return list
}

export function useTokenLibrary(yDoc: Y.Doc) {
  const yBlueprints = yDoc.getMap<TokenBlueprint>('token_blueprints')
  const [blueprints, setBlueprints] = useState<TokenBlueprint[]>(() => readBlueprints(yBlueprints))

  useEffect(() => {
    setBlueprints(readBlueprints(yBlueprints))
    const observer = () => setBlueprints(readBlueprints(yBlueprints))
    yBlueprints.observe(observer)
    return () => yBlueprints.unobserve(observer)
  }, [yBlueprints])

  const addBlueprint = (bp: TokenBlueprint) => {
    yBlueprints.set(bp.id, bp)
  }

  const updateBlueprint = (id: string, updates: Partial<TokenBlueprint>) => {
    const existing = yBlueprints.get(id)
    if (existing) {
      yBlueprints.set(id, { ...existing, ...updates })
    }
  }

  const deleteBlueprint = (id: string) => {
    yBlueprints.delete(id)
  }

  return { blueprints, addBlueprint, updateBlueprint, deleteBlueprint }
}
