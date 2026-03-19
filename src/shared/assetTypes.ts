export const AUTO_TAGS = ['map', 'token', 'portrait'] as const

export interface AssetMeta {
  id: string
  url: string
  name: string
  mediaType: 'image' | 'handout'
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
