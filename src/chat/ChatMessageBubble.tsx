import type { ChatTextMessage } from './chatTypes'

interface ChatMessageBubbleProps {
  message: ChatTextMessage
  isNew?: boolean
}

export function ChatMessageBubble({ message, isNew }: ChatMessageBubbleProps) {
  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(8px)',
        borderRadius: 10,
        padding: '8px 12px',
        animation: isNew ? 'notifSlideUp 0.3s ease-out' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: message.senderColor,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, fontSize: 12, color: '#333' }}>
          {message.senderName}
        </span>
        <span style={{ fontSize: 10, color: '#aaa', marginLeft: 'auto' }}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div style={{ fontSize: 13, color: '#333', paddingLeft: 13, marginTop: 2, wordBreak: 'break-word' }}>
        {message.content}
      </div>
    </div>
  )
}
