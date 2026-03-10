import type { DiceTermResult } from '../shared/diceUtils'
import type { JudgmentResult, DieStyle, JudgmentDisplay } from '../rules/types'

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
  expression: string
  resolvedExpression?: string
  terms: DiceTermResult[]
  total: number
  timestamp: number
  actionName?: string
  judgment?: JudgmentResult
  dieStyles?: DieStyle[]
  judgmentDisplay?: JudgmentDisplay
  modifiersApplied?: string[]
}

export type ChatMessage = ChatTextMessage | ChatRollMessage
