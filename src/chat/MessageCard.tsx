import React from 'react'
import type { ChatMessage } from './chatTypes'
import { Avatar } from './Avatar'
import { DiceResultCard } from './DiceResultCard'

interface MessageCardProps {
  message: ChatMessage
  isNew?: boolean
  animationStyle?: 'toast' | 'scroll'
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
  const animation = isNew
    ? animationStyle === 'toast'
      ? 'toastEnter 0.3s ease-out'
      : 'messageEnter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
    : 'none'

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  }

  const nameStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: message.senderColor,
  }

  const timeStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  }

  if (message.type === 'text') {
    return (
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '10px 14px',
          background: 'rgba(30, 35, 48, 0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(100, 116, 139, 0.3)',
          boxShadow:
            '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          borderRadius: 10,
          animation,
        }}
      >
        <Avatar
          portraitUrl={message.portraitUrl}
          senderName={message.senderName}
          senderColor={message.senderColor}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={headerStyle}>
            <span style={nameStyle}>{message.senderName}</span>
            <span style={timeStyle}>{formatTime(message.timestamp)}</span>
          </div>
          <div
            style={{
              fontSize: 14,
              color: '#e2e8f0',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  // Dice message
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '12px 16px',
        background:
          'linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.92) 100%)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        boxShadow:
          '0 4px 16px rgba(59, 130, 246, 0.15), inset 0 1px 0 rgba(96, 165, 250, 0.1)',
        borderRadius: 12,
        animation,
      }}
    >
      <Avatar
        portraitUrl={message.portraitUrl}
        senderName={message.senderName}
        senderColor={message.senderColor}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ ...headerStyle, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={nameStyle}>{message.senderName}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
              /r {message.expression}
              {message.resolvedExpression && (
                <span style={{ color: 'rgba(255,255,255,0.3)' }}> ({message.resolvedExpression})</span>
              )}
            </span>
          </div>
          <span style={timeStyle}>{formatTime(message.timestamp)}</span>
        </div>
        <DiceResultCard message={message} isNew={isNew} />
      </div>
    </div>
  )
}
