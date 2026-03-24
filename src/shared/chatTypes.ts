import type { DiceSpec } from './diceUtils'

export interface MessageOrigin {
  seat: {
    id: string
    name: string
    color: string // seat's own color (from seats table)
  }
  entity?: {
    id: string
    name: string
    color: string
    portraitUrl?: string
  }
}

/** Extract display-facing identity from origin (entity takes priority over seat) */
export function getDisplayIdentity(origin: MessageOrigin): {
  name: string
  color: string
  portraitUrl?: string
} {
  if (origin.entity) {
    return {
      name: origin.entity.name,
      color: origin.entity.color,
      portraitUrl: origin.entity.portraitUrl,
    }
  }
  return { name: origin.seat.name, color: origin.seat.color }
}

export interface ChatTextMessage {
  type: 'text'
  id: string
  origin: MessageOrigin
  content: string
  timestamp: number
}

export interface ChatRollMessage {
  type: 'roll'
  id: string
  origin: MessageOrigin
  timestamp: number

  formula: string // original formula (with @key), for display
  resolvedFormula?: string // @key resolved actual formula, for parsing dice

  dice: DiceSpec[] // client sends, server passes through
  rolls: number[][] // server-generated raw random numbers

  rollType?: string // 'daggerheart:dd' etc., for looking up rollCardRenderers
  actionName?: string
}

export interface ChatJudgmentMessage {
  type: 'judgment'
  id: string
  origin: MessageOrigin
  timestamp: number
  rollMessageId: string
  judgment: {
    type: string
    outcome: string
  }
  displayText: string
  displayColor: string
}

export type ChatMessage = ChatTextMessage | ChatRollMessage | ChatJudgmentMessage
