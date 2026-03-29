import { useMemo } from 'react'
import { getRenderer, type LogEntryRenderer } from './rendererRegistry'
import type { LogEntryRendererProps } from './rendererRegistry'
import type { GameLogEntry } from '../shared/logTypes'
import { isLogType } from '../shared/logTypes'
import type { ChatMessage } from '../shared/chatTypes'

// Temporary fallback imports (remove after full migration)
import { MessageCard } from '../chat/MessageCard'

/** Convert a GameLogEntry to a ChatMessage for the legacy fallback path */
function logEntryToChatMessage(entry: GameLogEntry): ChatMessage | null {
  if (isLogType(entry, 'core:text')) {
    return {
      type: 'text',
      id: entry.id,
      origin: entry.origin,
      content: entry.payload.content,
      timestamp: entry.timestamp,
    }
  }
  if (isLogType(entry, 'core:roll-result')) {
    return {
      type: 'roll',
      id: entry.id,
      origin: entry.origin,
      timestamp: entry.timestamp,
      formula: entry.payload.formula,
      resolvedFormula: entry.payload.resolvedFormula,
      dice: entry.payload.dice,
      rolls: entry.payload.rolls,
      rollType: entry.payload.rollType,
      actionName: entry.payload.actionName,
    }
  }
  return null
}

/** Stable wrapper — receives a resolved renderer as a prop so React sees a static component type */
function RendererBridge({
  renderer: Renderer,
  entry,
  isNew,
  animationStyle,
}: {
  renderer: LogEntryRenderer
} & LogEntryRendererProps) {
  return <Renderer entry={entry} isNew={isNew} animationStyle={animationStyle} />
}

export function LogEntryCard({
  entry,
  isNew,
  animationStyle,
}: {
  entry: GameLogEntry
  isNew?: boolean
  animationStyle?: 'toast' | 'scroll'
}) {
  const renderer = useMemo(() => getRenderer('chat', entry.type), [entry.type])
  if (renderer) {
    return (
      <RendererBridge
        renderer={renderer}
        entry={entry}
        isNew={isNew}
        animationStyle={animationStyle}
      />
    )
  }

  // Temporary fallback for types not yet migrated
  const chatMsg = logEntryToChatMessage(entry)
  if (!chatMsg) return null
  return <MessageCard message={chatMsg} isNew={isNew} animationStyle={animationStyle} />
}
