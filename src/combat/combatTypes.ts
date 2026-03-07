import type { Resource, Attribute, Status } from '../shared/tokenTypes'

export interface CombatToken {
  id: string
  name: string
  imageUrl: string
  x: number        // map-pixel position
  y: number
  size: number     // grid cells (1 = 1x1, 2 = 2x2)
  ownerId: string | null  // seatId, null = NPC
  gmOnly: boolean
  color: string    // border/ring color
  resources: Resource[]
  attributes: Attribute[]
  statuses: Status[]
  notes: string
}
