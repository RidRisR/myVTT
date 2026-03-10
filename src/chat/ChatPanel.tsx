import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as Y from 'yjs'
import type { ChatMessage, ChatRollMessage } from './chatTypes'
import type { Entity } from '../shared/entityTypes'
import type { RuleSystem } from '../rules/types'
import { getEntityResources, getEntityAttributes } from '../shared/entityAdapters'
import { MessageScrollArea } from './MessageScrollArea'
import { ToastStack, type ToastItem } from './ToastStack'
import { ChatInput } from './ChatInput'
import { Avatar } from './Avatar'

interface ChatPanelProps {
  yDoc: Y.Doc
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string
  seatProperties: { key: string; value: string }[]
  selectedTokenProps?: { key: string; value: string }[]
  speakerEntities: Entity[]
  ruleSystem?: RuleSystem
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
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: isActive
          ? 'rgba(59,130,246,0.2)'
          : hover
            ? 'rgba(255,255,255,0.08)'
            : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <Avatar
        portraitUrl={identity.portraitUrl}
        senderName={identity.name}
        senderColor={identity.color}
        size={28}
      />
      <div
        style={{
          fontSize: 13,
          fontWeight: isActive ? 600 : 400,
          color: isActive ? '#93c5fd' : '#e2e8f0',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
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
  ruleSystem,
}: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set())
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([])
  const initialLoadRef = useRef(true)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const [expandHover, setExpandHover] = useState(false)

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
      // Enrich named roll commands (e.g. .dd) with rule system judgment
      if (message.type === 'roll' && ruleSystem && message.actionName) {
        const rollMsg = message as ChatRollMessage
        if (!rollMsg.judgment) {
          const judgment = ruleSystem.evaluateRoll(rollMsg.terms, rollMsg.total, {
            activeModifierIds: [],
            tempModifier: 0,
          })
          if (judgment) {
            rollMsg.judgment = judgment
            rollMsg.dieStyles = ruleSystem.getDieStyles(rollMsg.terms)
            rollMsg.judgmentDisplay = ruleSystem.getJudgmentDisplay(judgment)
          }
        }
      }
      yChat.push([message])
    },
    [yChat, ruleSystem],
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
          style={{
            position: 'fixed',
            bottom: 62,
            right: 440,
            width: 200,
            maxHeight: 280,
            zIndex: 10001,
            background: 'rgba(15, 15, 25, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflowY: 'auto',
            padding: 6,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.3)',
              padding: '4px 10px',
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
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
        style={{
          position: 'fixed',
          bottom: 12,
          right: 16,
          width: 546,
          zIndex: 10000,
          display: 'flex',
          gap: 6,
          alignItems: 'stretch',
        }}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          onMouseEnter={() => setExpandHover(true)}
          onMouseLeave={() => setExpandHover(false)}
          style={{
            width: 36,
            borderRadius: 10,
            background: expandHover ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            cursor: 'pointer',
            transition: 'all 0.15s',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            flexShrink: 0,
          }}
          aria-label={expanded ? 'Collapse chat history' : 'Expand chat history'}
        >
          {expanded ? '▼' : '▲'}
        </button>

        {/* Speaker avatar button */}
        <button
          ref={speakerBtnRef}
          onClick={() => setShowSpeakerPicker((v) => !v)}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'transparent',
            border: showSpeakerPicker ? '2px solid rgba(59,130,246,0.6)' : '2px solid transparent',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'border-color 0.15s',
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

        <div style={{ flex: 1 }}>
          <ChatInput
            senderId={activeSpeaker.id}
            senderName={activeSpeaker.name}
            senderColor={activeSpeaker.color}
            portraitUrl={activeSpeaker.portraitUrl}
            onSend={handleSend}
            selectedTokenProps={selectedTokenProps}
            seatProperties={activeSpeakerProps}
            onCycleSpeaker={speakerEntities.length > 0 ? handleCycleSpeaker : undefined}
            customCommands={ruleSystem?.getChatCommands()}
          />
        </div>
      </div>
    </>
  )
}
