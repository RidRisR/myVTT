import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare } from 'lucide-react'
import { RIGHT_PANEL_WIDTH } from '../shared/layoutConstants'
import type { ChatMessage } from '../shared/chatTypes'
import { MessageCard } from './MessageCard'

interface MessageScrollAreaProps {
  messages: ChatMessage[]
  newMessageIds: Set<string>
}

export function MessageScrollArea({ messages, newMessageIds }: MessageScrollAreaProps) {
  const { t } = useTranslation('chat')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const checkIfAtBottom = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50)
  }

  // Auto-scroll to bottom when new message arrives (if already at bottom)
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, isAtBottom])

  // Scroll to bottom on first mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  return (
    <>
      <style>{`
        @keyframes messageEnter {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          60% {
            transform: translateY(0) scale(1.02);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .message-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .message-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .message-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 3px;
        }
        .message-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.25);
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: 68,
          right: 16,
          width: RIGHT_PANEL_WIDTH,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'none',
        }}
      >
        {/* Scrollable card list — no background wrapper */}
        <div
          ref={scrollRef}
          className="message-scroll"
          style={{
            maxHeight: '50vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'auto',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 40px)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40px)',
          }}
          onScroll={checkIfAtBottom}
          onWheel={(e) => {
            e.stopPropagation()
          }}
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <MessageSquare size={32} strokeWidth={1} className="text-text-muted/40" />
              <p className="text-text-muted text-sm">{t('no_messages')}</p>
              <p className="text-text-muted/50 text-xs">{t('start_adventure')}</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageCard
                key={msg.id}
                message={msg}
                isNew={newMessageIds.has(msg.id)}
                animationStyle="scroll"
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}
