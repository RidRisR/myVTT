import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as Y from 'yjs'
import type { ChatMessage } from './chatTypes'
import type { DiceFavorite } from '../identity/useIdentity'
import { rollCompound, resolveFormula, generateFavoriteName } from '../shared/diceUtils'
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
  favorites: DiceFavorite[]
  onAddFavorite: (fav: DiceFavorite) => void
  onRemoveFavorite: (formula: string) => void
}

function FavoriteItem({ fav, onRoll, onRemove }: {
  fav: DiceFavorite
  onRoll: () => void
  onRemove: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onRoll}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: hover ? 'rgba(255,255,255,0.08)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fav.name}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
          .r {fav.formula}
        </div>
      </div>
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.2)',
            border: 'none',
            color: '#ef4444',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          ✕
        </button>
      )}
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
  favorites,
  onAddFavorite,
  onRemoveFavorite,
}: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set())
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([])
  const initialLoadRef = useRef(true)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const [expandHover, setExpandHover] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [favHover, setFavHover] = useState(false)
  const favPanelRef = useRef<HTMLDivElement>(null)
  const favBtnRef = useRef<HTMLButtonElement>(null)

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

  // Click outside to close favorites panel
  useEffect(() => {
    if (!showFavorites) return
    const handler = (e: PointerEvent) => {
      if (favPanelRef.current?.contains(e.target as Node)) return
      if (favBtnRef.current?.contains(e.target as Node)) return
      setShowFavorites(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [showFavorites])

  const handleToastRemove = useCallback((id: string) => {
    setToastQueue((prev) => prev.filter((item) => item.message.id !== id))
  }, [])

  const handleSend = useCallback(
    (message: ChatMessage) => {
      yChat.push([message])
    },
    [yChat],
  )

  // Roll a formula directly (used by favorites)
  const rollFormula = useCallback((formula: string) => {
    let expression = formula
    let resolvedExpression = formula

    if (/@[\p{L}\p{N}_]+/u.test(formula)) {
      const resolved = resolveFormula(formula, selectedTokenProps, seatProperties)
      if ('error' in resolved) return
      expression = formula
      resolvedExpression = resolved.resolved
    }

    const result = rollCompound(resolvedExpression)
    if (!result || 'error' in result) return

    const id = self.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
    yChat.push([{
      type: 'roll' as const,
      id,
      senderId,
      senderName,
      senderColor,
      portraitUrl,
      expression,
      resolvedExpression: expression !== resolvedExpression ? resolvedExpression : undefined,
      terms: result.termResults,
      total: result.total,
      timestamp: Date.now(),
    }])
  }, [selectedTokenProps, seatProperties, senderId, senderName, senderColor, portraitUrl, yChat])

  // Favorites helpers
  const favoritedFormulas = useMemo(
    () => new Set(favorites.map(f => f.formula)),
    [favorites],
  )

  const handleToggleFavorite = useCallback((expression: string) => {
    if (favoritedFormulas.has(expression)) {
      onRemoveFavorite(expression)
    } else {
      onAddFavorite({
        name: generateFavoriteName(expression),
        formula: expression,
      })
    }
  }, [favoritedFormulas, onAddFavorite, onRemoveFavorite])

  return (
    <>
      {expanded ? (
        <MessageScrollArea
          messages={messages}
          newMessageIds={newMessageIds}
          favoritedFormulas={favoritedFormulas}
          onToggleFavorite={handleToggleFavorite}
        />
      ) : (
        <ToastStack toastQueue={toastQueue} onRemove={handleToastRemove} />
      )}

      {/* Favorites panel (floats above input bar) */}
      {showFavorites && (
        <div
          ref={favPanelRef}
          style={{
            position: 'fixed',
            bottom: 62,
            right: 16,
            width: 300,
            maxHeight: 240,
            zIndex: 10001,
            background: 'rgba(15, 15, 25, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflowY: 'auto',
            padding: 8,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {favorites.length === 0 ? (
            <div style={{
              color: 'rgba(255,255,255,0.3)',
              fontSize: 12,
              textAlign: 'center',
              padding: '16px 8px',
            }}>
              No saved formulas yet.
              Hover over a dice card to save one.
            </div>
          ) : (
            favorites.map((fav, i) => (
              <FavoriteItem
                key={fav.formula + i}
                fav={fav}
                onRoll={() => {
                  rollFormula(fav.formula)
                  setShowFavorites(false)
                }}
                onRemove={() => onRemoveFavorite(fav.formula)}
              />
            ))
          )}
        </div>
      )}

      {/* Chat input + buttons (always visible) */}
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          right: 16,
          width: 420,
          zIndex: 10000,
          display: 'flex',
          gap: 6,
          alignItems: 'stretch',
        }}
      >
        {/* ☆ Favorites button */}
        <button
          ref={favBtnRef}
          onClick={() => setShowFavorites(v => !v)}
          onMouseEnter={() => setFavHover(true)}
          onMouseLeave={() => setFavHover(false)}
          style={{
            width: 36,
            borderRadius: 10,
            background: favHover || showFavorites
              ? 'rgba(255,255,255,0.18)'
              : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            cursor: 'pointer',
            transition: 'all 0.15s',
            color: showFavorites ? '#fbbf24' : 'rgba(255,255,255,0.5)',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            flexShrink: 0,
          }}
          aria-label="Dice favorites"
        >
          {showFavorites ? '★' : '☆'}
        </button>

        <div style={{ flex: 1 }}>
          <ChatInput
            senderId={senderId}
            senderName={senderName}
            senderColor={senderColor}
            portraitUrl={portraitUrl}
            onSend={handleSend}
            selectedTokenProps={selectedTokenProps}
            seatProperties={seatProperties}
          />
        </div>

        {/* Expand/collapse toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          onMouseEnter={() => setExpandHover(true)}
          onMouseLeave={() => setExpandHover(false)}
          style={{
            width: 36,
            borderRadius: 10,
            background: expandHover
              ? 'rgba(255,255,255,0.18)'
              : 'rgba(255,255,255,0.08)',
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
      </div>
    </>
  )
}
