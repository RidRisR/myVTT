export interface AssetMeta {
  id: string
  url: string
  name: string
  type: 'image' | 'blueprint' | 'handout'
  tags: string[]
  width?: number
  height?: number
  createdAt: number
  blueprint?: {
    defaultSize: number
    defaultColor: string
    defaultRuleData?: unknown
  }
  handout?: {
    title: string
    description: string
  }
}
