export type AssetCategory = 'map' | 'token'

export interface TagMeta {
  id: string
  name: string
  color: string | null
  sortOrder: number
  createdAt: number
}

export interface AssetMeta {
  id: string
  url: string
  name: string
  mediaType: 'image' | 'handout'
  category: AssetCategory
  tags: string[]
  sortOrder: number
  width?: number
  height?: number
  createdAt: number
  handout?: {
    title: string
    description: string
  }
}
