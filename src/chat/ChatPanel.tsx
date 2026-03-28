import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatMessage, MessageOrigin } from '../shared/chatTypes'
import { getDisplayIdentity } from '../shared/chatTypes'
import { isLogType } from '../shared/logTypes'
import type { GameLogEntry } from '../shared/logTypes'
import type { Entity } from '../shared/entityTypes'
import { getName, getColor, getImageUrl } from '../shared/coreComponents'
import { useRulePlugin } from '../rules/useRulePlugin'
import { useWorldStore } from '../stores/worldStore'
import { useWorkflowRunner } from '../workflow/useWorkflowSDK'
import { getSendTextWorkflow } from '../workflow/baseWorkflows'
import type { WorkflowHandle } from '../workflow/types'
import { MessageScrollArea } from './MessageScrollArea'
import { ToastStack, type ToastItem } from './ToastStack'
import { ChatInput } from './ChatInput'
import { Avatar } from './Avatar'
import * as Popover from '@radix-ui/react-popover'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { RIGHT_PANEL_WIDTH } from '../shared/layoutConstants'

// Module-level constants for stable references
const EMPTY_FRESH_IDS = new Set<string>()

/** Convert a GameLogEntry to a ChatMessage for rendering */
function logEntryToChatMessage(entry: GameLogEntry): ChatMessage | null {
  if (isLogType(entry, 'core:text')) {
    return {
      type: 'text',
      id: entry.id,
      origin: entry.origin,
      content: entry.payload.content,
      timestamp: entry.timestamp,
    }
  }
  if (isLogType(entry, 'core:roll-result')) {
    return {
      type: 'roll',
      id: entry.id,
      origin: entry.origin,
      timestamp: entry.timestamp,
      formula: entry.payload.formula,
      resolvedFormula: entry.payload.resolvedFormula,
      dice: entry.payload.dice,
      rolls: entry.payload.rolls,
      rollType: entry.payload.rollType,
      actionName: entry.payload.actionName,
    }
  }
  return null
}

interface ChatPanelProps {
  roomId: string
  senderId: string
  senderName: string
  senderColor: string
  seatProperties: { key: string; value: string }[]
  selectedTokenProps?: { key: string; value: string }[]
  speakerEntities: Entity[]
}

/** Display identity for speaker picker items */
interface SpeakerDisplayIdentity {
  name: string
  color: string
  portraitUrl?: string
}

function SpeakerPickerItem({
  identity,
  isActive,
  onSelect,
}: {
  identity: SpeakerDisplayIdentity
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
  seatProperties,
  selectedTokenProps = [],
  speakerEntities,
}: Omit<ChatPanelProps, 'roomId'>) {
  const { t } = useTranslation('chat')
  const [expanded, setExpanded] = useState(false)
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([])
  const initialLoadRef = useRef(true)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const prevMessageCountRef = useRef(0)

  // Speaker switching
  const [speakerCharId, setSpeakerCharId] = useState<string | null>(null)
  const [showSpeakerPicker, setShowSpeakerPicker] = useState(false)

  const plugin = useRulePlugin()
  const runner = useWorkflowRunner()

  // Map game_log entries to ChatMessage for rendering
  const logEntries = useWorldStore((s) => s.logEntries)
  const messages = useMemo(
    () => logEntries.map(logEntryToChatMessage).filter((m): m is ChatMessage => m !== null),
    [logEntries],
  )
  const freshChatIds = EMPTY_FRESH_IDS

  // Build origin: null = seat identity, string = character
  const seatOrigin: MessageOrigin = useMemo(
    () => ({
      seat: { id: senderId, name: senderName, color: senderColor },
    }),
    [senderId, senderName, senderColor],
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

  const activeOrigin: MessageOrigin = useMemo(
    () => ({
      seat: { id: senderId, name: senderName, color: senderColor },
      entity: speakerEntity
        ? {
            id: speakerEntity.id,
            name: getName(speakerEntity),
            color: getColor(speakerEntity),
            portraitUrl: getImageUrl(speakerEntity) || undefined,
          }
        : undefined,
    }),
    [senderId, senderName, senderColor, speakerEntity],
  )

  const activeDisplay = useMemo(() => getDisplayIdentity(activeOrigin), [activeOrigin])

  // When speaking as an entity, use that entity's properties for @ resolution
  const activeSpeakerProps = useMemo(() => {
    if (!speakerEntity) return seatProperties
    const tokens = plugin.adapters.getFormulaTokens(speakerEntity)
    return Object.entries(tokens).map(([key, value]) => ({ key, value: String(value) }))
  }, [speakerEntity, seatProperties, plugin])

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

      // Add to toast queue if collapsed
      if (!expandedRef.current) {
        for (const msg of newMsgs) {
          setToastQueue((prev) => [...prev, { message: msg, timestamp: Date.now() }])
        }
      }
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

  const handleToastRemove = useCallback((id: string) => {
    setToastQueue((prev) => prev.filter((item) => item.message.id !== id))
  }, [])

  const handleSend = useCallback(
    (message: ChatMessage) => {
      if (message.type !== 'text') return
      void runner.runWorkflow(getSendTextWorkflow(), {
        content: message.content,
        senderName: senderName,
      })
    },
    [runner, senderName],
  )

  const handleCommand = useCallback(
    (handle: WorkflowHandle, raw: string) => {
      void runner.runWorkflow(handle, {
        raw,
        actorId: senderId,
        speakerId: speakerCharId,
        seatId: senderId,
        origin: activeOrigin,
      })
    },
    [runner, senderId, speakerCharId, activeOrigin],
  )

  // Tab to cycle speaker: seat → entity1 → entity2 → ... → seat
  const handleCycleSpeaker = useCallback(() => {
    if (speakerEntities.length === 0) return
    if (speakerCharId === null) {
      setSpeakerCharId(speakerEntities[0]?.id ?? null)
    } else {
      const idx = speakerEntities.findIndex((e) => e.id === speakerCharId)
      if (idx < 0 || idx >= speakerEntities.length - 1) {
        setSpeakerCharId(null)
      } else {
        setSpeakerCharId(speakerEntities[idx + 1]?.id ?? null)
      }
    }
  }, [speakerCharId, speakerEntities])

  return (
    <>
      {expanded ? (
        <MessageScrollArea messages={messages} newMessageIds={freshChatIds} />
      ) : (
        <ToastStack toastQueue={toastQueue} onRemove={handleToastRemove} />
      )}

      {/* Chat input + buttons (always visible) */}
      <div
        className="fixed bottom-3 right-4 z-ui flex gap-1.5 items-stretch"
        style={{ width: RIGHT_PANEL_WIDTH }}
      >
        <button
          onClick={() => {
            setExpanded((v) => !v)
          }}
          className="w-9 rounded-[10px] bg-surface border border-border-glass cursor-pointer transition-all duration-fast text-text-muted text-sm flex items-center justify-center backdrop-blur-[8px] shrink-0 hover:bg-hover hover:text-text-primary"
          aria-label={expanded ? t('collapse_history') : t('expand_history')}
          data-testid="chat-toggle"
        >
          {expanded ? (
            <ChevronDown size={16} strokeWidth={1.5} />
          ) : (
            <ChevronUp size={16} strokeWidth={1.5} />
          )}
        </button>

        {/* Speaker picker — Radix Popover */}
        <Popover.Root open={showSpeakerPicker} onOpenChange={setShowSpeakerPicker} modal={false}>
          <Popover.Trigger asChild>
            <button
              className="w-9 h-9 rounded-[10px] bg-transparent cursor-pointer p-0 flex items-center justify-center shrink-0 transition-[border-color] duration-fast"
              style={{
                border: showSpeakerPicker
                  ? '2px solid rgba(212,160,85,0.6)'
                  : '2px solid transparent',
              }}
              aria-label={t('switch_speaker')}
            >
              <Avatar
                portraitUrl={activeDisplay.portraitUrl}
                senderName={activeDisplay.name}
                senderColor={activeDisplay.color}
                size={28}
              />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="start"
              sideOffset={6}
              className="z-popover bg-glass backdrop-blur-[16px] border border-border-glass rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-y-auto p-1.5 w-[200px] max-h-[280px] outline-none"
              onPointerDown={(e) => {
                e.stopPropagation()
              }}
            >
              <div className="text-[10px] text-text-muted/30 px-2.5 py-1 uppercase tracking-wider">
                {t('speak_as')}
              </div>
              <SpeakerPickerItem
                identity={getDisplayIdentity(seatOrigin)}
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
                    name: getName(e),
                    color: getColor(e),
                    portraitUrl: getImageUrl(e) || undefined,
                  }}
                  isActive={speakerCharId === e.id}
                  onSelect={() => {
                    setSpeakerCharId(e.id)
                    setShowSpeakerPicker(false)
                  }}
                />
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <div className="flex-1">
          <ChatInput
            origin={activeOrigin}
            onSend={handleSend}
            onCommand={handleCommand}
            selectedTokenProps={selectedTokenProps}
            seatProperties={activeSpeakerProps}
            onCycleSpeaker={speakerEntities.length > 0 ? handleCycleSpeaker : undefined}
          />
        </div>
      </div>
    </>
  )
}
