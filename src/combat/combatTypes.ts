export interface CombatToken {
  id: string
  characterId: string       // links to Character (source of truth for name, image, resources, etc.)
  x: number                 // map-pixel position
  y: number
  size: number              // grid cells (1 = 1x1, 2 = 2x2)
  gmOnly: boolean
}

export interface TokenBlueprint {
  id: string
  name: string
  imageUrl: string
  defaultSize: number   // grid cells (1 = 1x1)
  defaultColor: string
}
