import React from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatMessage } from '../shared/chatTypes'
import { getDisplayIdentity } from '../shared/chatTypes'
import { Avatar } from './Avatar'

interface MessageCardProps {
  message: ChatMessage
  isNew?: boolean
  animationStyle?: 'toast' | 'scroll'
  isFavorited?: boolean
  onToggleFavorite?: (formula: string) => void
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export const MessageCard: React.FC<MessageCardProps> = ({
  message,
  isNew = false,
  animationStyle = 'scroll',
}) => {
  const { t: _t } = useTranslation('chat')

  const display = getDisplayIdentity(message.origin)

  const animation = isNew
    ? animationStyle === 'toast'
      ? 'toastEnter 0.3s ease-out'
      : 'messageEnter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
    : 'none'

  if (message.type === 'text') {
    return (
      <div
        className="flex gap-2.5 px-3.5 py-2.5 bg-glass backdrop-blur-[20px] border border-border-glass shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] rounded-[10px]"
        style={{ animation }}
      >
        <Avatar
          portraitUrl={display.portraitUrl}
          senderName={display.name}
          senderColor={display.color}
        />
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold" style={{ color: display.color }}>
              {display.name}
            </span>
            <span className="text-[11px] text-text-muted/40">{formatTime(message.timestamp)}</span>
          </div>
          <div className="text-sm text-text-primary leading-relaxed break-words">
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  if (message.type === 'judgment') {
    return (
      <div
        className="flex gap-2.5 px-3.5 py-2 bg-glass backdrop-blur-[20px] border border-border-glass rounded-[10px]"
        style={{ animation }}
      >
        <Avatar
          portraitUrl={display.portraitUrl}
          senderName={display.name}
          senderColor={display.color}
        />
        <div className="flex-1 flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: message.displayColor }}>
            {message.displayText}
          </span>
          <span className="text-[11px] text-text-muted/40">{formatTime(message.timestamp)}</span>
        </div>
      </div>
    )
  }

  // Fallback: unknown message type — render nothing
  return null
}
