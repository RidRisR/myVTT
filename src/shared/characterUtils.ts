import type { Entity } from './entityTypes'
import { getName } from './coreComponents'

/**
 * Generate the next numbered name for an NPC from a blueprint.
 * e.g. "Goblin" → "Goblin 1", "Goblin 2", etc.
 */
export function nextNpcName(
  baseName: string,
  existingEntities: Entity[],
  blueprintId: string,
): string {
  const siblings = existingEntities.filter((e) => e.blueprintId === blueprintId)
  if (siblings.length === 0) return `${baseName} 1`

  const numbers = siblings.map((e) => {
    const match = getName(e).match(/(\d+)$/)
    return match ? parseInt(match[1] ?? '0', 10) : 0
  })
  const maxNum = Math.max(0, ...numbers)
  return `${baseName} ${maxNum + 1}`
}
