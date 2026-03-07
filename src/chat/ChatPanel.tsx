import { useEffect, useRef, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { ChatMessage } from './chatTypes'
import { ChatMessageBubble } from './ChatMessageBubble'
import { DiceResultCard } from './DiceResultCard'
import { ChatInput } from './ChatInput'

const MAX_VISIBLE = 5

interface ChatPanelProps {
  yDoc: Y.Doc
  senderId: string
  senderName: string
  senderColor: string
  seatProperties: { key: string; value: string }[]
  selectedTokenProps?: { key: string; value: string }[]
}

export function ChatPanel({
  yDoc,
  senderId,
  senderName,
  senderColor,
  seatProperties,
  selectedTokenProps = [],
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)
  const initialLoadRef = useRef(true)
  const historyEndRef = useRef<HTMLDivElement>(null)

  const yChat = yDoc.getArray<ChatMessage>('chat_log')

  // Sync messages from Yjs
  useEffect(() => {
    setMessages(yChat.toArray())
    // Mark initial load done after first sync
    requestAnimationFrame(() => { initialLoadRef.current = false })

    const observer = (event: Y.YArrayEvent<ChatMessage>) => {
      setMessages(yChat.toArray())

      if (!initialLoadRef.current) {
        const addedIds = new Set<string>()
        for (const item of event.changes.added) {
          const content = item.content as Y.ContentAny
          if (content.arr) {
            for (const msg of content.arr) {
              if (msg && typeof msg === 'object' && 'id' in msg) {
                addedIds.add((msg as ChatMessage).id)
              }
            }
          }
        }
        if (addedIds.size > 0) {
          setNewMessageIds((prev) => new Set([...prev, ...addedIds]))
          setTimeout(() => {
            setNewMessageIds((prev) => {
              const next = new Set(prev)
              for (const id of addedIds) next.delete(id)
              return next
            })
          }, 2500)
        }
      }
    }
    yChat.observe(observer)
    return () => yChat.unobserve(observer)
  }, [yChat])

  // Scroll history panel to bottom when opened
  useEffect(() => {
    if (showHistory) {
      historyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [showHistory, messages.length])

  const handleSend = useCallback((message: ChatMessage) => {
    yChat.push([message])
  }, [yChat])

  // Recent messages for the notification stack
  const recentMessages = messages.slice(-MAX_VISIBLE)

  return (
    <>
      {/* CSS animations */}
      <style>{`
        @keyframes notifSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes reelLand {
          0% { border-color: #60a5fa; box-shadow: 0 0 8px rgba(96,165,250,0.6); }
          100% { border-color: transparent; box-shadow: none; }
        }
        @keyframes totalPop {
          0% { transform: scale(0.8); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* History panel (fullscreen overlay when expanded) */}
      {showHistory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10001,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: 16,
          }}
          onClick={() => setShowHistory(false)}
        >
          <div
            style={{
              width: 420,
              maxHeight: '70vh',
              background: '#fff',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#333' }}>History</span>
              <button
                onClick={() => setShowHistory(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#999', padding: 2, display: 'flex',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && (
                <div style={{ color: '#bbb', textAlign: 'center', padding: 32, fontSize: 13 }}>
                  No messages yet.
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id}>
                  {msg.type === 'text' ? (
                    <ChatMessageBubble message={msg} />
                  ) : (
                    <DiceResultCard message={msg} />
                  )}
                </div>
              ))}
              <div ref={historyEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* Bottom overlay: notification stack + input */}
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          right: 16,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          width: 420,
          pointerEvents: 'none',
        }}
      >
        {/* History toggle (only when there are more messages than visible) */}
        {messages.length > MAX_VISIBLE && (
          <button
            onClick={() => setShowHistory(true)}
            style={{
              pointerEvents: 'auto',
              alignSelf: 'flex-start',
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: 11,
              color: '#666',
              cursor: 'pointer',
            }}
          >
            {messages.length - MAX_VISIBLE} earlier messages
          </button>
        )}

        {/* Notification stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recentMessages.map((msg) => (
            <div key={msg.id} style={{ pointerEvents: 'auto' }}>
              {msg.type === 'text' ? (
                <ChatMessageBubble message={msg} isNew={newMessageIds.has(msg.id)} />
              ) : (
                <DiceResultCard message={msg} isNew={newMessageIds.has(msg.id)} />
              )}
            </div>
          ))}
        </div>

        {/* Input bar */}
        <div style={{ pointerEvents: 'auto' }}>
          <ChatInput
            selectedTokenProps={selectedTokenProps}
            senderId={senderId}
            senderName={senderName}
            senderColor={senderColor}
            seatProperties={seatProperties}
            onSend={handleSend}
          />
        </div>
      </div>
    </>
  )
}
