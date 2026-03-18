export interface ShowcaseItem {
  id: string
  type: 'handout' | 'image' | 'text'
  title?: string
  description?: string
  imageUrl?: string
  text?: string
  senderId: string
  senderName: string
  senderColor: string
  ephemeral: boolean
  timestamp: number
}
