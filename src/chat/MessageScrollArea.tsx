import React, { useRef, useEffect, useState } from 'react'
import type { ChatMessage } from './chatTypes'
import { MessageCard } from './MessageCard'

interface MessageScrollAreaProps {
  messages: ChatMessage[]
  newMessageIds: Set<string>
  onCollapse: () => void
}

export function MessageScrollArea({
  messages,
  newMessageIds,
  onCollapse,
}: MessageScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [collapseHover, setCollapseHover] = useState(false)

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
          background: rgba(255,255,255,0.05);
          border-radius: 3px;
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
          width: 420,
          background: 'rgba(15, 15, 25, 0.88)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Collapse button */}
        <button
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: collapseHover
              ? 'rgba(255, 255, 255, 0.15)'
              : 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s',
            color: 'rgba(255,255,255,0.6)',
            fontSize: 14,
            zIndex: 1,
            transform: collapseHover ? 'scale(1.1)' : 'scale(1)',
          }}
          onMouseEnter={() => setCollapseHover(true)}
          onMouseLeave={() => setCollapseHover(false)}
          onClick={onCollapse}
          aria-label="Collapse chat"
          aria-expanded
        >
          ▼
        </button>

        {/* Scrollable message area */}
        <div
          ref={scrollRef}
          className="message-scroll"
          style={{
            maxHeight: '50vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            maskImage:
              'linear-gradient(to bottom, transparent 0%, black 40px)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, black 40px)',
          }}
          onScroll={checkIfAtBottom}
        >
          {messages.length === 0 && (
            <div
              style={{
                color: 'rgba(255,255,255,0.3)',
                textAlign: 'center',
                padding: 32,
                fontSize: 13,
              }}
            >
              No messages yet.
            </div>
          )}
          {messages.map((msg) => (
            <MessageCard
              key={msg.id}
              message={msg}
              isNew={newMessageIds.has(msg.id)}
              animationStyle="scroll"
            />
          ))}
        </div>
      </div>
    </>
  )
}
