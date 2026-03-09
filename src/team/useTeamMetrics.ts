import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { generateTokenId } from '../shared/idUtils'

export interface TeamTracker {
  id: string
  label: string
  current: number
  max: number
  color: string
  sortOrder: number
}

function readTrackers(yMap: Y.Map<TeamTracker>): TeamTracker[] {
  const items: TeamTracker[] = []
  yMap.forEach((item) => items.push(item))
  items.sort((a, b) => a.sortOrder - b.sortOrder)
  return items
}

const DEFAULT_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899']

export function useTeamMetrics(yDoc: Y.Doc) {
  const yMetrics = yDoc.getMap<TeamTracker>('team_metrics')
  const [trackers, setTrackers] = useState<TeamTracker[]>(() => readTrackers(yMetrics))

  useEffect(() => {
    setTrackers(readTrackers(yMetrics))
    const observer = () => setTrackers(readTrackers(yMetrics))
    yMetrics.observe(observer)
    return () => yMetrics.unobserve(observer)
  }, [yMetrics])

  const addTracker = (label: string) => {
    const id = generateTokenId()
    const count = yMetrics.size
    const colorIndex = count % DEFAULT_COLORS.length
    const tracker: TeamTracker = {
      id,
      label,
      current: 0,
      max: 10,
      color: DEFAULT_COLORS[colorIndex],
      sortOrder: count,
    }
    yMetrics.set(id, tracker)
  }

  const updateTracker = (id: string, updates: Partial<TeamTracker>) => {
    const existing = yMetrics.get(id)
    if (existing) {
      yMetrics.set(id, { ...existing, ...updates })
    }
  }

  const deleteTracker = (id: string) => {
    yMetrics.delete(id)
  }

  return { trackers, addTracker, updateTracker, deleteTracker }
}
