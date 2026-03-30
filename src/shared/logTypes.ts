import type { MessageOrigin } from './chatTypes'
import type { DiceSpec } from './diceUtils'

// ── Visibility ──
export type Visibility =
  | Record<string, never> // {} = public
  | { include: string[] } // whitelist
  | { exclude: string[] } // blacklist

// ── GameLogEntry (server → client, with seq) ──
export interface GameLogEntry {
  seq: number
  id: string
  type: string
  origin: MessageOrigin
  executor: string
  parentId?: string
  groupId: string
  chainDepth: number
  triggerable: boolean
  visibility: Visibility
  baseSeq: number
  payload: Record<string, unknown>
  timestamp: number
}

// ── LogEntrySubmission (client → server, no seq/executor) ──
export interface LogEntrySubmission {
  id: string
  type: string
  origin: MessageOrigin
  parentId?: string
  groupId: string
  chainDepth: number
  triggerable: boolean
  visibility: Visibility
  baseSeq: number
  payload: Record<string, unknown>
  timestamp: number
}

// ── LogPayloadMap — maps log entry type → typed payload ──
export interface LogPayloadMap {
  'core:text': {
    content: string
    senderName?: string
  }
  'core:roll-result': {
    formula: string
    resolvedFormula?: string
    dice: DiceSpec[]
    rolls: number[][]
    rollType?: string
    actionName?: string
  }
  'core:tracker-update': {
    label: string
    current?: number
    snapshot?: import('./storeTypes').TeamTracker
  }
  'core:component-update': {
    entityId: string
    key: string
    data: unknown
  }
}

/** Type guard — narrows GameLogEntry to typed payload within if/switch blocks */
export function isLogType<T extends keyof LogPayloadMap>(
  entry: GameLogEntry,
  type: T,
): entry is GameLogEntry & { type: T; payload: LogPayloadMap[T] } {
  return entry.type === type
}

// ── RollRequest (client → server for RNG) ──
export interface RollRequest {
  origin: MessageOrigin
  parentId?: string
  groupId: string
  chainDepth: number
  triggerable: boolean
  visibility: Visibility
  dice: DiceSpec[]
  formula: string
  resolvedFormula?: string
  rollType?: string
  actionName?: string
}

// ── Ack types ──
export type LogEntryAck = GameLogEntry | { error: string }

export type RollRequestAck = GameLogEntry | { error: string }

// ── Constants ──
export const MAX_CHAIN_DEPTH = 10

// ── Trigger definition (for PluginSDK.registerTrigger) ──
export interface TriggerDefinition {
  id: string
  on: string
  filter?: Record<string, unknown>
  workflow: string
  mapInput: (entry: GameLogEntry) => Record<string, unknown>
  executeAs: 'triggering-executor'
}
