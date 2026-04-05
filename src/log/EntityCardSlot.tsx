import type { EntityCardProps } from '../rules/types'
import { useWorldStore } from '../stores/worldStore'
import { getEntityCard } from './entityBindings'

/** Renders the plugin-registered EntityCard for the current room's rule system.
 *  The component reference is stable for a given ruleSystemId (resolved from RendererRegistry).
 *  Suppress static-components: this is a plugin system pattern where component types are
 *  resolved dynamically from a typed registry — the reference is stable per ruleSystemId. */
/* eslint-disable react-hooks/static-components */
export function EntityCardSlot(props: EntityCardProps) {
  const ruleSystemId = useWorldStore((s) => s.room.ruleSystemId)
  const Card = getEntityCard(ruleSystemId)
  if (!Card) return null
  return <Card {...props} />
}
/* eslint-enable react-hooks/static-components */
