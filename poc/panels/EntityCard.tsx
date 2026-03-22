import { useState, useCallback } from 'react'
import { useComponent } from '../hooks'
import { useEvent } from '../eventBus'
import { damageDealtEvent } from '../plugins/core/events'
import { createDataReader } from '../dataReader'
import { makeDnDSDK } from '../../src/ui-system/dnd'
import { getSpellDropHandler } from './spellDropHandler'
import type { Health } from '../plugins/core/components'
import type { Resistances } from '../plugins/status-fx/components'
import type { SpellPayload } from './StatusTagPalette'
import type { DnDPayload } from '../../src/ui-system/types'

const dnd = makeDnDSDK()
const reader = createDataReader()

export function EntityCard({ entityId }: { entityId: string }) {
  const health = useComponent<Health>(entityId, 'core:health')
  const resistances = useComponent<Resistances>(entityId, 'status-fx:resistances')

  const [isHit, setIsHit] = useState(false)

  useEvent(
    damageDealtEvent,
    useCallback(
      (payload) => {
        if (payload.targetId === entityId) {
          setIsHit(true)
          setTimeout(() => setIsHit(false), 300)
        }
      },
      [entityId],
    ),
  )

  const dropZoneProps = dnd.makeDropZone({
    accept: ['spell'],
    canDrop: () => {
      const h = reader.component<Health>(entityId, 'core:health')
      return h !== undefined && h.hp > 0
    },
    onDrop: (payload: DnDPayload) => {
      const spell = payload.data as SpellPayload
      getSpellDropHandler()?.(entityId, spell)
    },
  })

  return (
    <div
      {...dropZoneProps}
      className={`rounded border p-3 transition-colors duration-300 ${
        isHit ? 'border-red-500 bg-red-500/10' : 'border-border bg-surface'
      }`}
    >
      <h3 className="font-semibold text-foreground">{entityId}</h3>
      {health && (
        <div className="mt-1 text-sm text-muted">
          HP: {health.hp} / {health.maxHp}
        </div>
      )}
      {resistances && (
        <div className="mt-1 text-xs text-muted">
          Resistances:{' '}
          {Object.entries(resistances)
            .map(([k, v]) => `${k}:${v}`)
            .join(', ')}
        </div>
      )}
    </div>
  )
}
