import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as Y from 'yjs'
import type { ChatMessage } from './chatTypes'
import type { Entity } from '../shared/entityTypes'
import { getEntityResources, getEntityAttributes } from '../shared/entityAdapters'
import { MessageScrollArea } from './MessageScrollArea'
import { ToastStack, type ToastItem } from './ToastStack'
import { ChatInput } from './ChatInput'
import { Avatar } from './Avatar'
import { ChevronUp, ChevronDown } from 'lucide-react'

interface ChatPanelProps {
  yDoc: Y.Doc
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string
  seatProperties: { key: string; value: string }[]
  selectedTokenProps?: { key: string; value: string }[]
  speakerEntities: Entity[]
}

/** Resolved identity used for sending messages */
interface SpeakerIdentity {
  id: string
  name: string
  color: string
  portraitUrl?: string
}

function SpeakerPickerItem({
  identity,
  isActive,
  onSelect,
}: {
  identity: SpeakerIdentity
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors duration-fast ${
        isActive ? 'bg-accent/20' : 'hover:bg-hover'
      }`}
    >
      <Avatar
        portraitUrl={identity.portraitUrl}
        senderName={identity.name}
        senderColor={identity.color}
        size={28}
      />
      <div
        className={`text-[13px] overflow-hidden text-ellipsis whitespace-nowrap ${
          isActive ? 'font-semibold text-accent' : 'font-normal text-text-primary'
        }`}
      >
        {identity.name}
      </div>
    </div>
  )
}

export function ChatPanel({
  yDoc,
  senderId,
  senderName,
  senderColor,
  portraitUrl,
  seatProperties,
  selectedTokenProps = [],
  speakerEntities,
}: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set())
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([])
  const initialLoadRef = useRef(true)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  // Speaker switching
  const [speakerCharId, setSpeakerCharId] = useState<string | null>(null)
  const [showSpeakerPicker, setShowSpeakerPicker] = useState(false)
  const speakerPickerRef = useRef<HTMLDivElement>(null)
  const speakerBtnRef = useRef<HTMLButtonElement>(null)

  // Build speaker identity: null = seat identity, string = character
  const seatIdentity: SpeakerIdentity = useMemo(
    () => ({
      id: senderId,
      name: senderName,
      color: senderColor,
      portraitUrl,
    }),
    [senderId, senderName, senderColor, portraitUrl],
  )

  const speakerEntity = speakerCharId
    ? (speakerEntities.find((e) => e.id === speakerCharId) ?? null)
    : null

  // If selected entity was deleted, reset to seat
  useEffect(() => {
    if (speakerCharId && !speakerEntity) {
      setSpeakerCharId(null)
    }
  }, [speakerCharId, speakerEntity])

  const activeSpeaker: SpeakerIdentity = speakerEntity
    ? {
        id: senderId,
        name: speakerEntity.name,
        color: speakerEntity.color,
        portraitUrl: speakerEntity.imageUrl || undefined,
      }
    : seatIdentity

  // When speaking as an entity, use that entity's properties for @ resolution
  const activeSpeakerProps = useMemo(() => {
    if (!speakerEntity) return seatProperties
    const resources = getEntityResources(speakerEntity)
    const attributes = getEntityAttributes(speakerEntity)
    return [
      ...resources.filter((r) => r.key).map((r) => ({ key: r.key, value: String(r.current) })),
      ...attributes.filter((a) => a.key).map((a) => ({ key: a.key, value: String(a.value) })),
    ]
  }, [speakerEntity, seatProperties])

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
                  setToastQueue((prev) => [...prev, { message: chatMsg, timestamp: Date.now() }])
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

  // Click outside to close popups
  useEffect(() => {
    if (!showSpeakerPicker) return
    const handler = (e: PointerEvent) => {
      if (speakerPickerRef.current?.contains(e.target as Node)) return
      if (speakerBtnRef.current?.contains(e.target as Node)) return
      setShowSpeakerPicker(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [showSpeakerPicker])

  const handleToastRemove = useCallback((id: string) => {
    setToastQueue((prev) => prev.filter((item) => item.message.id !== id))
  }, [])

  const handleSend = useCallback(
    (message: ChatMessage) => {
      yChat.push([message])
    },
    [yChat],
  )

  // Tab to cycle speaker: seat → entity1 → entity2 → ... → seat
  const handleCycleSpeaker = useCallback(() => {
    if (speakerEntities.length === 0) return
    if (speakerCharId === null) {
      // Currently seat → go to first entity
      setSpeakerCharId(speakerEntities[0].id)
    } else {
      const idx = speakerEntities.findIndex((e) => e.id === speakerCharId)
      if (idx < 0 || idx >= speakerEntities.length - 1) {
        // Last entity or not found → back to seat
        setSpeakerCharId(null)
      } else {
        setSpeakerCharId(speakerEntities[idx + 1].id)
      }
    }
  }, [speakerCharId, speakerEntities])

  return (
    <>
      {expanded ? (
        <MessageScrollArea messages={messages} newMessageIds={newMessageIds} />
      ) : (
        <ToastStack toastQueue={toastQueue} onRemove={handleToastRemove} />
      )}

      {/* Speaker picker (floats above avatar button) */}
      {showSpeakerPicker && (
        <div
          ref={speakerPickerRef}
          className="fixed z-toast bg-glass backdrop-blur-[16px] border border-border-glass rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-y-auto p-1.5"
          style={{
            bottom: 62,
            right: 440,
            width: 200,
            maxHeight: 280,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] text-text-muted/30 px-2.5 py-1 uppercase tracking-wider">
            Speak as
          </div>
          {/* Seat identity (player) */}
          <SpeakerPickerItem
            identity={seatIdentity}
            isActive={speakerCharId === null}
            onSelect={() => {
              setSpeakerCharId(null)
              setShowSpeakerPicker(false)
            }}
          />
          {/* Entities */}
          {speakerEntities.map((e) => (
            <SpeakerPickerItem
              key={e.id}
              identity={{
                id: senderId,
                name: e.name,
                color: e.color,
                portraitUrl: e.imageUrl || undefined,
              }}
              isActive={speakerCharId === e.id}
              onSelect={() => {
                setSpeakerCharId(e.id)
                setShowSpeakerPicker(false)
              }}
            />
          ))}
        </div>
      )}

      {/* Chat input + buttons (always visible) */}
      <div
        className="fixed bottom-3 right-4 z-toast flex gap-1.5 items-stretch"
        style={{ width: 546 }}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-9 rounded-[10px] bg-surface border border-border-glass cursor-pointer transition-all duration-fast text-text-muted text-sm flex items-center justify-center backdrop-blur-[8px] shrink-0 hover:bg-hover hover:text-text-primary"
          aria-label={expanded ? 'Collapse chat history' : 'Expand chat history'}
        >
          {expanded ? (
            <ChevronDown size={16} strokeWidth={1.5} />
          ) : (
            <ChevronUp size={16} strokeWidth={1.5} />
          )}
        </button>

        {/* Speaker avatar button */}
        <button
          ref={speakerBtnRef}
          onClick={() => setShowSpeakerPicker((v) => !v)}
          className="w-9 h-9 rounded-[10px] bg-transparent cursor-pointer p-0 flex items-center justify-center shrink-0 transition-[border-color] duration-fast"
          style={{
            border: showSpeakerPicker ? '2px solid rgba(212,160,85,0.6)' : '2px solid transparent',
          }}
          aria-label="Switch speaker"
        >
          <Avatar
            portraitUrl={activeSpeaker.portraitUrl}
            senderName={activeSpeaker.name}
            senderColor={activeSpeaker.color}
            size={28}
          />
        </button>

        <div className="flex-1">
          <ChatInput
            senderId={activeSpeaker.id}
            senderName={activeSpeaker.name}
            senderColor={activeSpeaker.color}
            portraitUrl={activeSpeaker.portraitUrl}
            onSend={handleSend}
            selectedTokenProps={selectedTokenProps}
            seatProperties={activeSpeakerProps}
            onCycleSpeaker={speakerEntities.length > 0 ? handleCycleSpeaker : undefined}
          />
        </div>
      </div>
    </>
  )
}
