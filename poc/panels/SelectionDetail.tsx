import { useEntity, useComponent } from '../hooks'
import type { Health } from '../plugins/core/components'
import type { Resistances } from '../plugins/status-fx/components'

export function SelectionDetail({ entityId }: { entityId: string | null }) {
  // Hooks must be called unconditionally, so use '' as fallback
  const entity = useEntity(entityId ?? '')
  const health = useComponent<Health>(entityId ?? '', 'core:health')
  const resistances = useComponent<Resistances>(entityId ?? '', 'status-fx:resistances')

  if (!entityId || !entity) {
    return (
      <div className="p-3 text-sm text-muted">
        No entity selected. Click an entity in the list to view details.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <h3 className="font-semibold text-foreground">{entity.name}</h3>
      <div className="text-xs text-muted">ID: {entity.id}</div>
      {health && (
        <div className="text-sm">
          HP: {health.hp} / {health.maxHp}
        </div>
      )}
      {resistances && (
        <div className="text-xs text-muted">
          Resistances: {Object.entries(resistances).map(([k, v]) => `${k}:${v}`).join(', ')}
        </div>
      )}
    </div>
  )
}
