import { useState } from 'react'
import { useEvent } from '../eventBus'
import { damageDealtEvent } from '../plugins/core/events'
import type { DamageDealtPayload } from '../plugins/core/events'

interface LogEntry extends DamageDealtPayload {
  timestamp: number
}

export function DamageLog() {
  const [entries, setEntries] = useState<LogEntry[]>([])

  useEvent(damageDealtEvent, (payload) => {
    setEntries((prev) => [...prev, { ...payload, timestamp: Date.now() }])
  })

  return (
    <div className="flex flex-col gap-1 p-3">
      <h3 className="text-sm font-semibold text-muted">Damage Log</h3>
      {entries.length === 0 && <div className="text-xs text-muted">No damage dealt yet</div>}
      {entries.map((entry, i) => (
        <div key={i} className="text-xs text-foreground">
          {entry.targetId}: -{entry.damage} {entry.damageType}
        </div>
      ))}
    </div>
  )
}
