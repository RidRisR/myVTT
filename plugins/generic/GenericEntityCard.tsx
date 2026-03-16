// plugins/generic/GenericEntityCard.tsx
// Special exception: imports CharacterEditPanel directly from src/.
// This is the only plugin allowed to do this — it's the legacy bridge.
import type { EntityCardProps } from '@myvtt/sdk'
import { CharacterEditPanel } from '../../src/layout/CharacterEditPanel'

export function GenericEntityCard({ entity, onUpdate, readonly }: EntityCardProps) {
  if (readonly) {
    // Read-only: render panel with no update handler and no close button.
    // CharacterDetailPanel integration deferred (see plan Deferred table).
    return <CharacterEditPanel character={entity} onUpdateCharacter={() => {}} />
  }
  return (
    <CharacterEditPanel
      character={entity}
      onUpdateCharacter={(_id, patch) => {
        onUpdate(patch)
      }}
    />
  )
}
