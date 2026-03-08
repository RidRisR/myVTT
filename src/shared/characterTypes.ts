import type { Resource, Attribute, Status, Handout } from './tokenTypes'
import type { DiceFavorite } from '../identity/useIdentity'

export interface Character {
  id: string
  name: string
  imageUrl: string          // portrait/token image
  color: string             // ring/accent color
  type: 'pc' | 'npc'       // player character or NPC
  seatId?: string           // for PCs: links back to owning Seat
  blueprintId?: string      // for NPCs: links back to source blueprint
  size: number              // grid cells (1 = 1x1), used when spawning token
  resources: Resource[]
  attributes: Attribute[]
  statuses: Status[]
  notes: string
  handouts?: Handout[]      // PCs only
  favorites?: DiceFavorite[] // PCs only
  featured: boolean         // whether shown in PortraitBar's Characters tab
}
