import type { DiceTermResult } from '../shared/diceUtils'

export interface ChatTextMessage {
  type: 'text'
  id: string
  senderId: string
  senderName: string
  senderColor: string
  content: string
  timestamp: number
}

export interface ChatRollMessage {
  type: 'roll'
  id: string
  senderId: string
  senderName: string
  senderColor: string
  expression: string
  resolvedExpression?: string
  terms: DiceTermResult[]
  total: number
  timestamp: number
}

export type ChatMessage = ChatTextMessage | ChatRollMessage
