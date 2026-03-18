export interface AssetMeta {
  id: string
  url: string
  name: string
  mediaType: 'image' | 'handout'
  tags: string[]
  width?: number
  height?: number
  createdAt: number
  handout?: {
    title: string
    description: string
  }
}
