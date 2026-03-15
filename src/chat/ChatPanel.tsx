import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { ChatMessage } from './chatTypes'
import type { Entity } from '../shared/entityTypes'
import { getEntityResources, getEntityAttributes } from '../shared/entityAdapters'
import { useWorldStore } from '../stores/worldStore'
import { MessageScrollArea } from './MessageScrollArea'
import { ToastStack, type ToastItem } from './ToastStack'
import { ChatInput } from './ChatInput'
import { Avatar } from './Avatar'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { RIGHT_PANEL_WIDTH } from '../shared/layoutConstants'

interface ChatPanelProps {
  roomId: string
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
  senderId,
  senderName,
  senderColor,
  portraitUrl,
  seatProperties,
  selectedTokenProps = [],
  speakerEntities,
}: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set())
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([])
  const initialLoadRef = useRef(true)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const prevMessageCountRef = useRef(0)

  // Speaker switching
  const [speakerCharId, setSpeakerCharId] = useState<string | null>(null)
  const [showSpeakerPicker, setShowSpeakerPicker] = useState(false)
  const speakerPickerRef = useRef<HTMLDivElement>(null)
  const speakerBtnRef = useRef<HTMLButtonElement>(null)

  // Read messages from worldStore
  const messages = useWorldStore((s) => s.chatMessages)
  const sendMessage = useWorldStore((s) => s.sendMessage)
  const sendRoll = useWorldStore((s) => s.sendRoll)

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

  const activeSpeaker: SpeakerIdentity = useMemo(
    () =>
      speakerEntity
        ? {
            id: senderId,
            name: speakerEntity.name,
            color: speakerEntity.color,
            portraitUrl: speakerEntity.imageUrl || undefined,
          }
        : seatIdentity,
    [speakerEntity, senderId, seatIdentity],
  )

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

  // Detect new messages (from worldStore updates via Socket.io)
  useEffect(() => {
    // Skip initial load
    if (initialLoadRef.current) {
      prevMessageCountRef.current = messages.length
      requestAnimationFrame(() => {
        initialLoadRef.current = false
      })
      return
    }

    // Detect newly added messages
    if (messages.length > prevMessageCountRef.current) {
      const newMsgs = messages.slice(prevMessageCountRef.current)
      const addedIds = new Set(newMsgs.map((m) => m.id))

      // Add to toast queue if collapsed
      if (!expandedRef.current) {
        for (const msg of newMsgs) {
          setToastQueue((prev) => [...prev, { message: msg, timestamp: Date.now() }])
        }
      }

      setNewMessageIds((prev) => new Set([...prev, ...addedIds]))
      setTimeout(() => {
        setNewMessageIds((prev) => {
          const next = new Set(prev)
          for (const id of addedIds) next.delete(id)
          return next
        })
      }, 2500)
    }
    prevMessageCountRef.current = messages.length
  }, [messages])

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
      if (message.type === 'text') {
        sendMessage({
          senderId: message.senderId,
          senderName: message.senderName,
          senderColor: message.senderColor,
          portraitUrl: message.portraitUrl,
          content: message.content,
        })
      }
    },
    [sendMessage],
  )

  const handleRoll = useCallback(
    (formula: string, resolvedExpression?: string) => {
      sendRoll({
        formula,
        resolvedExpression,
        senderId: activeSpeaker.id,
        senderName: activeSpeaker.name,
        senderColor: activeSpeaker.color,
        portraitUrl: activeSpeaker.portraitUrl,
      })
    },
    [sendRoll, activeSpeaker],
  )

  // Tab to cycle speaker: seat → entity1 → entity2 → ... → seat
  const handleCycleSpeaker = useCallback(() => {
    if (speakerEntities.length === 0) return
    if (speakerCharId === null) {
      setSpeakerCharId(speakerEntities[0].id)
    } else {
      const idx = speakerEntities.findIndex((e) => e.id === speakerCharId)
      if (idx < 0 || idx >= speakerEntities.length - 1) {
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
          <SpeakerPickerItem
            identity={seatIdentity}
            isActive={speakerCharId === null}
            onSelect={() => {
              setSpeakerCharId(null)
              setShowSpeakerPicker(false)
            }}
          />
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
        style={{ width: RIGHT_PANEL_WIDTH }}
      >
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
            onRoll={handleRoll}
            selectedTokenProps={selectedTokenProps}
            seatProperties={activeSpeakerProps}
            onCycleSpeaker={speakerEntities.length > 0 ? handleCycleSpeaker : undefined}
          />
        </div>
      </div>
    </>
  )
}
