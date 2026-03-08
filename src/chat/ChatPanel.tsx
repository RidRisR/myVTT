import { useEffect, useRef, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { ChatMessage } from './chatTypes'
import { MessageScrollArea } from './MessageScrollArea'
import { ToastStack, type ToastItem } from './ToastStack'
import { ChatInput } from './ChatInput'

interface ChatPanelProps {
  yDoc: Y.Doc
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string
  seatProperties: { key: string; value: string }[]
  selectedTokenProps?: { key: string; value: string }[]
}

export function ChatPanel({
  yDoc,
  senderId,
  senderName,
  senderColor,
  portraitUrl,
  seatProperties,
  selectedTokenProps = [],
}: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set())
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([])
  const initialLoadRef = useRef(true)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const yChat = yDoc.getArray<ChatMessage>('chat_log')

  // Sync messages from Yjs
  useEffect(() => {
    setMessages(yChat.toArray())
    requestAnimationFrame(() => {
      initialLoadRef.current = false
    })

    const observer = (event: Y.YArrayEvent<ChatMessage>) => {
      const newMsgs = yChat.toArray()
      setMessages(newMsgs)

      if (!initialLoadRef.current) {
        const addedIds = new Set<string>()
        for (const item of event.changes.added) {
          const content = item.content as Y.ContentAny
          if (content.arr) {
            for (const msg of content.arr) {
              if (msg && typeof msg === 'object' && 'id' in msg) {
                const chatMsg = msg as ChatMessage
                addedIds.add(chatMsg.id)

                // Add to toast queue if collapsed
                if (!expandedRef.current) {
                  setToastQueue((prev) => [
                    ...prev,
                    { message: chatMsg, timestamp: Date.now() },
                  ])
                }
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

  // Limit to max 3 toasts
  useEffect(() => {
    if (toastQueue.length > 3) {
      setToastQueue((prev) => prev.slice(-3))
    }
  }, [toastQueue.length])

  // Clear toasts when expanding
  useEffect(() => {
    if (expanded) {
      setToastQueue([])
    }
  }, [expanded])

  const handleToastRemove = useCallback((id: string) => {
    setToastQueue((prev) => prev.filter((item) => item.message.id !== id))
  }, [])

  const handleSend = useCallback(
    (message: ChatMessage) => {
      yChat.push([message])
    },
    [yChat],
  )

  const handleInputFocus = useCallback(() => {
    if (!expanded) {
      setExpanded(true)
    }
  }, [expanded])

  const handleCollapse = useCallback(() => {
    setExpanded(false)
  }, [])

  return (
    <>
      {expanded ? (
        <MessageScrollArea
          messages={messages}
          newMessageIds={newMessageIds}
          onCollapse={handleCollapse}
        />
      ) : (
        <ToastStack toastQueue={toastQueue} onRemove={handleToastRemove} />
      )}

      {/* Chat input (always visible) */}
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          right: 16,
          width: 420,
          zIndex: 10000,
        }}
      >
        <ChatInput
          senderId={senderId}
          senderName={senderName}
          senderColor={senderColor}
          portraitUrl={portraitUrl}
          onSend={handleSend}
          onFocus={handleInputFocus}
          selectedTokenProps={selectedTokenProps}
          seatProperties={seatProperties}
        />
      </div>
    </>
  )
}
