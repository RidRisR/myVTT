export interface Resource {
  key: string
  current: number
  max: number
  color: string
}

export interface Attribute {
  key: string
  value: number
}

export interface Status {
  label: string
}

export interface Handout {
  id: string
  title: string
  imageUrl?: string
  description: string
}
