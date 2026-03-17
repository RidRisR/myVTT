import type { DiceSpec } from './diceUtils'

export interface ChatTextMessage {
  type: 'text'
  id: string
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string
  content: string
  timestamp: number
}

export interface ChatRollMessage {
  type: 'roll'
  id: string
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string
  timestamp: number

  formula: string // 原始公式（含 @key），用于显示
  resolvedFormula?: string // @key 解析后的实际公式，用于解析 dice

  dice: DiceSpec[] // 客户端发送，服务端透传
  rolls: number[][] // 服务端生成的原始随机数

  rollType?: string // 'daggerheart:dd' 等，用于查 rollCardRenderers
  actionName?: string
}

export type ChatMessage = ChatTextMessage | ChatRollMessage
