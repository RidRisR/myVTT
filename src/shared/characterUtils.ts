import type { Character } from './characterTypes'

/**
 * Generate the next numbered name for an NPC from a blueprint.
 * e.g. "Goblin" → "Goblin 1", "Goblin 2", etc.
 */
export function nextNpcName(baseName: string, existingChars: Character[], blueprintId: string): string {
  const siblings = existingChars.filter(c => c.blueprintId === blueprintId)
  if (siblings.length === 0) return `${baseName} 1`

  const numbers = siblings.map(c => {
    const match = c.name.match(/(\d+)$/)
    return match ? parseInt(match[1], 10) : 0
  })
  const maxNum = Math.max(0, ...numbers)
  return `${baseName} ${maxNum + 1}`
}
