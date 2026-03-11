import React, { useState } from 'react'
import { Star } from 'lucide-react'
import type { ChatMessage } from './chatTypes'
import { Avatar } from './Avatar'
import { DiceResultCard } from './DiceResultCard'

interface MessageCardProps {
  message: ChatMessage
  isNew?: boolean
  animationStyle?: 'toast' | 'scroll'
  isFavorited?: boolean
  onToggleFavorite?: (expression: string) => void
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export const MessageCard: React.FC<MessageCardProps> = ({
  message,
  isNew = false,
  animationStyle = 'scroll',
  isFavorited = false,
  onToggleFavorite,
}) => {
  const [cardHover, setCardHover] = useState(false)

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
          portraitUrl={message.portraitUrl}
          senderName={message.senderName}
          senderColor={message.senderColor}
        />
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold" style={{ color: message.senderColor }}>
              {message.senderName}
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

  // Dice message
  return (
    <div
      onMouseEnter={() => setCardHover(true)}
      onMouseLeave={() => setCardHover(false)}
      className="relative flex gap-2.5 px-4 py-3 bg-glass backdrop-blur-[20px] border border-accent/40 shadow-[0_4px_16px_rgba(212,160,85,0.15),inset_0_1px_0_rgba(232,184,106,0.1)] rounded-xl"
      style={{ animation }}
    >
      {/* Favorite toggle */}
      {onToggleFavorite && cardHover && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite(message.expression)
          }}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/40 border-none cursor-pointer flex items-center justify-center transition-colors duration-fast z-[1]"
          style={{ color: isFavorited ? '#fbbf24' : 'rgba(255,255,255,0.6)' }}
          aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star size={14} strokeWidth={1.5} fill={isFavorited ? 'currentColor' : 'none'} />
        </button>
      )}
      <Avatar
        portraitUrl={message.portraitUrl}
        senderName={message.senderName}
        senderColor={message.senderColor}
      />
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color: message.senderColor }}>
              {message.senderName}
            </span>
            <span className="text-xs text-text-muted/50 font-mono">
              .r {message.expression}
              {message.resolvedExpression && (
                <span className="text-text-muted/30"> ({message.resolvedExpression})</span>
              )}
            </span>
          </div>
          <span className="text-[11px] text-text-muted/40">{formatTime(message.timestamp)}</span>
        </div>
        <DiceResultCard message={message} isNew={isNew} />
      </div>
    </div>
  )
}
