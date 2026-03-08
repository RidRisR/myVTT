# Chat UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform chat UI into collapsible dual-mode interface with enhanced visual design and slot machine-style dice animations.

**Architecture:** Refactor ChatPanel into three components: MessageScrollArea (expanded mode), ToastStack (collapsed mode), and enhanced MessageCard with avatars. Replace existing DiceReel with new slot machine animation system.

**Tech Stack:** React 19, TypeScript, Yjs, inline CSS-in-JS (no additional dependencies)

---

## Task 1: Create Avatar Component

**Files:**
- Create: `src/chat/Avatar.tsx`

**Step 1: Write Avatar component**

```typescript
import React from 'react'

interface AvatarProps {
  portraitUrl?: string
  senderName: string
  senderColor: string
  size?: number
}

export const Avatar: React.FC<AvatarProps> = ({
  portraitUrl,
  senderName,
  senderColor,
  size = 32
}) => {
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    overflow: 'hidden',
    border: '2px solid rgba(255,255,255,0.15)',
    flexShrink: 0
  }

  if (portraitUrl) {
    return (
      <div style={containerStyle}>
        <img
          src={portraitUrl}
          alt={senderName}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      </div>
    )
  }

  // Fallback: colored circle with first letter
  const fallbackStyle: React.CSSProperties = {
    ...containerStyle,
    background: senderColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: size * 0.4375, // 14px for 32px size
    fontWeight: 600
  }

  return (
    <div style={fallbackStyle}>
      {senderName[0]?.toUpperCase() || '?'}
    </div>
  )
}
```

**Step 2: Commit Avatar component**

```bash
git add src/chat/Avatar.tsx
git commit -m "feat(chat): add Avatar component for message cards"
```

---

## Task 2: Create Enhanced MessageCard Component

**Files:**
- Create: `src/chat/MessageCard.tsx`

**Step 1: Write MessageCard component with avatar layout**

```typescript
import React from 'react'
import type { ChatMessage } from './chatTypes'
import { Avatar } from './Avatar'
import { DiceResultCard } from './DiceResultCard'

interface MessageCardProps {
  message: ChatMessage
  isNew?: boolean
  animationStyle?: 'toast' | 'scroll'
}

export const MessageCard: React.FC<MessageCardProps> = ({
  message,
  isNew = false,
  animationStyle = 'scroll'
}) => {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }

  // Text message styling
  if (message.type === 'text') {
    const containerStyle: React.CSSProperties = {
      display: 'flex',
      gap: 10,
      padding: '10px 14px',
      background: 'rgba(30, 35, 48, 0.85)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(100, 116, 139, 0.3)',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      borderRadius: 10,
      animation: isNew
        ? animationStyle === 'toast'
          ? 'toastEnter 0.3s ease-out'
          : 'messageEnter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
        : 'none'
    }

    const contentStyle: React.CSSProperties = {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }

    const headerStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }

    const nameStyle: React.CSSProperties = {
      fontSize: 13,
      fontWeight: 600,
      color: message.senderColor
    }

    const timeStyle: React.CSSProperties = {
      fontSize: 11,
      color: 'rgba(255,255,255,0.4)'
    }

    const textStyle: React.CSSProperties = {
      fontSize: 14,
      color: '#e2e8f0',
      lineHeight: 1.4,
      wordBreak: 'break-word'
    }

    return (
      <div style={containerStyle}>
        <Avatar
          senderName={message.senderName}
          senderColor={message.senderColor}
        />
        <div style={contentStyle}>
          <div style={headerStyle}>
            <span style={nameStyle}>{message.senderName}</span>
            <span style={timeStyle}>{formatTime(message.timestamp)}</span>
          </div>
          <div style={textStyle}>{message.content}</div>
        </div>
      </div>
    )
  }

  // Dice message styling
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    padding: '12px 16px',
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.92) 100%)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(59, 130, 246, 0.4)',
    boxShadow: '0 4px 16px rgba(59, 130, 246, 0.15), inset 0 1px 0 rgba(96, 165, 250, 0.1)',
    borderRadius: 12,
    animation: isNew
      ? animationStyle === 'toast'
        ? 'toastEnter 0.3s ease-out'
        : 'messageEnter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
      : 'none'
  }

  const contentStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap'
  }

  const headerLeftStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  }

  const nameStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: message.senderColor
  }

  const expressionStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'monospace'
  }

  const timeStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)'
  }

  return (
    <div style={containerStyle}>
      <Avatar
        senderName={message.senderName}
        senderColor={message.senderColor}
      />
      <div style={contentStyle}>
        <div style={headerStyle}>
          <div style={headerLeftStyle}>
            <span style={nameStyle}>{message.senderName}</span>
            <span style={expressionStyle}>/r {message.expression}</span>
          </div>
          <span style={timeStyle}>{formatTime(message.timestamp)}</span>
        </div>
        <DiceResultCard message={message} />
      </div>
    </div>
  )
}
```

**Step 2: Commit MessageCard component**

```bash
git add src/chat/MessageCard.tsx
git commit -m "feat(chat): add MessageCard with avatar and enhanced styling"
```

---

## Task 3: Create ToastStack Component

**Files:**
- Create: `src/chat/ToastStack.tsx`

**Step 1: Write ToastStack with fade-out logic**

```typescript
import React, { useEffect, useState } from 'react'
import type { ChatMessage } from './chatTypes'
import { MessageCard } from './MessageCard'

interface ToastItem {
  message: ChatMessage
  timestamp: number
}

interface ToastStackProps {
  toastQueue: ToastItem[]
}

export const ToastStack: React.FC<ToastStackProps> = ({ toastQueue }) => {
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())

  // Calculate opacity for each toast
  const getToastOpacity = (index: number, elapsedTime: number) => {
    // Position-based opacity (0 = newest/bottom, 2 = oldest/top)
    const positionOpacity = index === 0 ? 1.0 : index === 1 ? 0.7 : 0.4

    // Time-based fade (0-2s: full, 2-3s: fade out)
    let timeFadeOpacity = 1.0
    if (elapsedTime >= 2000 && elapsedTime < 3000) {
      timeFadeOpacity = 1 - (elapsedTime - 2000) / 1000
    } else if (elapsedTime >= 3000) {
      timeFadeOpacity = 0
    }

    return positionOpacity * timeFadeOpacity
  }

  // Trigger exit animation for expired toasts
  useEffect(() => {
    const now = Date.now()
    const expiredIds = toastQueue
      .filter(item => now - item.timestamp >= 2800) // Start exit at 2.8s
      .map(item => item.message.id)

    if (expiredIds.length > 0) {
      setExitingIds(new Set(expiredIds))
    }
  }, [toastQueue])

  if (toastQueue.length === 0) return null

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 68, // Above input box
    right: 16,
    width: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    pointerEvents: 'none',
    zIndex: 10000
  }

  const now = Date.now()

  return (
    <>
      <style>{`
        @keyframes toastEnter {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes toastExit {
          to {
            opacity: 0;
            transform: translateY(-12px) scale(0.95);
          }
        }
        .toast-exiting {
          animation: toastExit 0.4s ease-in forwards;
        }
      `}</style>
      <div style={containerStyle}>
        {toastQueue.slice(-3).map((item, index) => {
          const elapsedTime = now - item.timestamp
          const opacity = getToastOpacity(index, elapsedTime)
          const isExiting = exitingIds.has(item.message.id)

          const itemStyle: React.CSSProperties = {
            opacity: isExiting ? undefined : opacity,
            pointerEvents: 'auto',
            transition: isExiting ? 'none' : 'opacity 0.2s ease-out'
          }

          return (
            <div
              key={item.message.id}
              style={itemStyle}
              className={isExiting ? 'toast-exiting' : ''}
            >
              <MessageCard
                message={item.message}
                isNew={elapsedTime < 300}
                animationStyle="toast"
              />
            </div>
          )
        })}
      </div>
    </>
  )
}
```

**Step 2: Commit ToastStack component**

```bash
git add src/chat/ToastStack.tsx
git commit -m "feat(chat): add ToastStack for collapsed mode notifications"
```

---

## Task 4: Create MessageScrollArea Component

**Files:**
- Create: `src/chat/MessageScrollArea.tsx`

**Step 1: Write MessageScrollArea with gradient mask**

```typescript
import React, { useRef, useEffect, useState } from 'react'
import type { ChatMessage } from './chatTypes'
import { MessageCard } from './MessageCard'

interface MessageScrollAreaProps {
  messages: ChatMessage[]
  newMessageIds: Set<string>
  onCollapse: () => void
}

export const MessageScrollArea: React.FC<MessageScrollAreaProps> = ({
  messages,
  newMessageIds,
  onCollapse
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Check if scrolled to bottom
  const checkIfAtBottom = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 50
    setIsAtBottom(atBottom)
  }

  // Auto-scroll to bottom when new message arrives (if already at bottom)
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, isAtBottom])

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 68, // Above input box
    right: 16,
    width: 420,
    background: 'rgba(15, 15, 25, 0.88)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column'
  }

  const scrollContainerStyle: React.CSSProperties = {
    maxHeight: '50vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column-reverse',
    gap: 8,
    padding: '12px',
    maskImage: 'linear-gradient(to bottom, transparent 0%, black 40px)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40px)'
  }

  const collapseButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16
  }

  const collapseButtonHoverStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.15)',
    transform: 'scale(1.1)'
  }

  const [isHovering, setIsHovering] = useState(false)

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
        /* Custom scrollbar */
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
      <div style={containerStyle}>
        <button
          style={isHovering ? { ...collapseButtonStyle, ...collapseButtonHoverStyle } : collapseButtonStyle}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onClick={onCollapse}
          aria-label="Collapse chat"
        >
          ▼
        </button>
        <div
          ref={scrollRef}
          className="message-scroll"
          style={scrollContainerStyle}
          onScroll={checkIfAtBottom}
        >
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
```

**Step 2: Commit MessageScrollArea component**

```bash
git add src/chat/MessageScrollArea.tsx
git commit -m "feat(chat): add MessageScrollArea for expanded mode"
```

---

## Task 5: Refactor ChatPanel to Use New Components

**Files:**
- Modify: `src/chat/ChatPanel.tsx`

**Step 1: Update ChatPanel with dual-mode logic**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { ChatMessage } from './chatTypes'
import { MessageScrollArea } from './MessageScrollArea'
import { ToastStack } from './ToastStack'
import { ChatInput } from './ChatInput'

interface ToastItem {
  message: ChatMessage
  timestamp: number
}

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
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set())
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([])
  const initialLoadRef = useRef(true)

  const yChat = yDoc.getArray<ChatMessage>('chat_log')

  // Sync messages from Yjs
  useEffect(() => {
    setMessages(yChat.toArray())
    requestAnimationFrame(() => { initialLoadRef.current = false })

    const observer = (event: Y.YArrayEvent<ChatMessage>) => {
      const newMessages = yChat.toArray()
      setMessages(newMessages)

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
                if (!expanded) {
                  setToastQueue(prev => [...prev, {
                    message: chatMsg,
                    timestamp: Date.now()
                  }])
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
  }, [yChat, expanded])

  // Auto-cleanup expired toasts
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setToastQueue(prev =>
        prev.filter(item => now - item.timestamp < 3000)
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Limit to max 3 toasts
  useEffect(() => {
    if (toastQueue.length > 3) {
      setToastQueue(prev => prev.slice(-3))
    }
  }, [toastQueue.length])

  // Clear toasts when expanding
  useEffect(() => {
    if (expanded) {
      setToastQueue([])
    }
  }, [expanded])

  const handleSend = useCallback((message: ChatMessage) => {
    yChat.push([message])
  }, [yChat])

  const handleInputClick = () => {
    if (!expanded) {
      setExpanded(true)
    }
  }

  const handleCollapse = () => {
    setExpanded(false)
  }

  return (
    <>
      {/* Render appropriate mode */}
      {expanded ? (
        <MessageScrollArea
          messages={messages}
          newMessageIds={newMessageIds}
          onCollapse={handleCollapse}
        />
      ) : (
        <ToastStack toastQueue={toastQueue} />
      )}

      {/* Chat input (always visible) */}
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          right: 16,
          width: 420,
          zIndex: 10000
        }}
      >
        <ChatInput
          senderId={senderId}
          senderName={senderName}
          senderColor={senderColor}
          onSend={handleSend}
          selectedTokenProps={selectedTokenProps}
          seatProperties={seatProperties}
          onFocus={handleInputClick}
        />
      </div>
    </>
  )
}
```

**Step 2: Update ChatInput to accept onFocus prop**

Modify `src/chat/ChatInput.tsx` to add:

```typescript
// Add to ChatInputProps interface
interface ChatInputProps {
  // ... existing props
  onFocus?: () => void
}

// In the component, add to textarea props:
<textarea
  // ... existing props
  onFocus={onFocus}
/>
```

**Step 3: Test basic collapsed/expanded toggle**

```bash
npm run dev
```

Expected:
- Chat starts collapsed (only input visible)
- Click input → expands to show message history
- Click ▼ button → collapses back
- New messages appear as toasts when collapsed

**Step 4: Commit ChatPanel refactor**

```bash
git add src/chat/ChatPanel.tsx src/chat/ChatInput.tsx
git commit -m "refactor(chat): implement dual-mode collapsed/expanded interface"
```

---

## Task 6: Rewrite DiceReel with Slot Machine Animation

**Files:**
- Modify: `src/chat/DiceReel.tsx`

**Step 1: Rewrite DiceReel component**

```typescript
import React, { useEffect, useState } from 'react'

interface DiceReelProps {
  sides: number
  result: number
  stopDelay: number // When to stop spinning (0.8s, 1.0s, 1.2s...)
  dropped?: boolean
}

type Phase = 'spinning' | 'landing' | 'stopped'

export function DiceReel({ sides, result, stopDelay, dropped = false }: DiceReelProps) {
  const [phase, setPhase] = useState<Phase>('spinning')
  const [displayValue, setDisplayValue] = useState(1)

  useEffect(() => {
    setPhase('spinning')
    setDisplayValue(1)

    // Phase 1: Spinning - rapidly change numbers
    const spinInterval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * sides) + 1)
    }, 50)

    // Phase 2: Stop and land
    const stopTimer = setTimeout(() => {
      clearInterval(spinInterval)
      setDisplayValue(result)
      setPhase('landing')

      // Phase 3: Finish landing animation
      setTimeout(() => setPhase('stopped'), 300)
    }, stopDelay * 1000)

    return () => {
      clearInterval(spinInterval)
      clearTimeout(stopTimer)
    }
  }, [stopDelay, result, sides])

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    height: 32,
    padding: '0 8px',
    borderRadius: 6,
    background: 'rgba(30, 41, 59, 0.6)',
    border: '1px solid rgba(96, 165, 250, 0.3)',
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    opacity: dropped ? 0.5 : 1,
    textDecoration: dropped ? 'line-through' : 'none',
    transition: phase === 'stopped' ? 'none' : undefined
  }

  const spinningStyle: React.CSSProperties = {
    ...baseStyle,
    filter: 'blur(2px)',
    boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)',
    animation: 'diceSpinning 0.8s linear infinite'
  }

  const landingStyle: React.CSSProperties = {
    ...baseStyle,
    animation: 'diceLand 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), flashPulse 0.3s ease-out',
    boxShadow: '0 0 20px rgba(59, 130, 246, 0.8), inset 0 0 10px rgba(96, 165, 250, 0.4)'
  }

  const stoppedStyle: React.CSSProperties = {
    ...baseStyle
  }

  const currentStyle =
    phase === 'spinning' ? spinningStyle :
    phase === 'landing' ? landingStyle :
    stoppedStyle

  return (
    <>
      <style>{`
        @keyframes diceSpinning {
          0% {
            transform: rotateX(0deg) rotateY(0deg);
          }
          100% {
            transform: rotateX(720deg) rotateY(360deg);
          }
        }
        @keyframes diceLand {
          0% {
            transform: scale(1) rotateZ(0deg);
            filter: blur(2px);
          }
          50% {
            transform: scale(1.3) rotateZ(10deg);
            filter: blur(0);
          }
          70% {
            transform: scale(0.95) rotateZ(-5deg);
          }
          100% {
            transform: scale(1) rotateZ(0deg);
            filter: blur(0);
          }
        }
        @keyframes flashPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
      <span style={currentStyle}>
        {displayValue}
      </span>
    </>
  )
}
```

**Step 2: Test dice animation in isolation**

Create a test message and observe:
- All dice spin together for 0.8s
- Dice stop sequentially (0.2s apart)
- Each die has pop+bounce landing effect
- Total duration ≤ 2s

**Step 3: Commit DiceReel rewrite**

```bash
git add src/chat/DiceReel.tsx
git commit -m "feat(chat): rewrite DiceReel with slot machine animation"
```

---

## Task 7: Update DiceResultCard with New Animation Timing

**Files:**
- Modify: `src/chat/DiceResultCard.tsx`

**Step 1: Update stop delay calculation**

Find the section where `DiceReel` components are created and update the delay logic:

```typescript
// Replace existing delay calculation with:
const SPIN_DURATION = 0.8 // All dice spin for 0.8s
const STOP_INTERVAL = 0.2 // Each die stops 0.2s apart

let diceIndex = 0
const reelGroups = message.terms.map((tr, ti) => {
  // ... existing term type checks

  if (tr.term.type === 'dice') {
    const reels = tr.allRolls.map((roll, ri) => {
      const stopDelay = SPIN_DURATION + (diceIndex * STOP_INTERVAL)
      diceIndex++
      const isDropped = !tr.keptIndices.includes(ri)
      return (
        <DiceReel
          key={`${ti}-${ri}`}
          sides={tr.term.sides}
          result={roll}
          stopDelay={stopDelay}
          dropped={isDropped}
        />
      )
    })
    // ... rest of rendering
  }
})
```

**Step 2: Update total reveal timing**

```typescript
// Calculate when to show total (after all dice have stopped + landing animation)
const totalDiceCount = message.terms.reduce(
  (sum, tr) => sum + (tr.term.type === 'dice' ? tr.allRolls.length : 0),
  0
)
const LAND_DURATION = 0.3
const TOTAL_DELAY = 0.2
const totalRevealTime = SPIN_DURATION + (totalDiceCount - 1) * STOP_INTERVAL + LAND_DURATION + TOTAL_DELAY

const [totalRevealed, setTotalRevealed] = useState(false)

useEffect(() => {
  const timer = setTimeout(() => {
    setTotalRevealed(true)
  }, totalRevealTime * 1000)
  return () => clearTimeout(timer)
}, [totalRevealTime])
```

**Step 3: Add total reveal animation**

```typescript
const totalStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: '#fbbf24',
  textShadow: '0 0 10px rgba(251, 191, 36, 0.8), 0 0 20px rgba(251, 191, 36, 0.4)',
  animation: totalRevealed ? 'totalReveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
  opacity: totalRevealed ? 1 : 0,
  transform: totalRevealed ? 'scale(1)' : 'scale(0.5)',
  transition: 'opacity 0.1s, transform 0.1s'
}

// Add CSS:
<style>{`
  @keyframes totalReveal {
    0% {
      opacity: 0;
      transform: scale(0.5) translateY(10px);
    }
    50% {
      transform: scale(1.2) translateY(-2px);
    }
    70% {
      transform: scale(0.95) translateY(1px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
`}</style>
```

**Step 4: Test complete dice animation**

Roll `/r 3d6+5` and verify:
- Time 0-0.8s: All 3 dice spinning
- Time 0.8s: Die 1 stops (lands with bounce)
- Time 1.0s: Die 2 stops
- Time 1.2s: Die 3 stops
- Time 1.7s: Total appears with gold pop effect
- Total duration: ~1.8s

**Step 5: Commit DiceResultCard updates**

```bash
git add src/chat/DiceResultCard.tsx
git commit -m "feat(chat): update dice timing for slot machine animation"
```

---

## Task 8: Clean Up Obsolete Components and Styles

**Files:**
- Modify: `src/chat/ChatPanel.tsx` (remove old animation keyframes)
- Delete: `src/chat/ChatMessageBubble.tsx` (replaced by MessageCard)

**Step 1: Remove old ChatMessageBubble import/usage**

ChatMessageBubble is now replaced by MessageCard component, so it can be deleted.

**Step 2: Clean up animation keyframes**

Remove old animation definitions that are now in component files:
- `notifSlideUp` → moved to ToastStack
- `reelLand` → moved to DiceReel
- `totalPop` → moved to DiceResultCard

**Step 3: Delete obsolete file**

```bash
git rm src/chat/ChatMessageBubble.tsx
git commit -m "refactor(chat): remove obsolete ChatMessageBubble component"
```

---

## Task 9: Add Portrait URL Support

**Files:**
- Modify: `src/chat/chatTypes.ts`
- Modify: `src/chat/MessageCard.tsx`
- Modify: `src/App.tsx`

**Step 1: Update ChatMessage type to include portraitUrl**

```typescript
// In chatTypes.ts, update interfaces:
interface ChatTextMessage {
  type: 'text'
  id: string
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string  // ADD THIS
  content: string
  timestamp: number
}

interface ChatRollMessage {
  type: 'roll'
  id: string
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string  // ADD THIS
  expression: string
  resolvedExpression?: string
  terms: DiceTermResult[]
  total: number
  timestamp: number
}
```

**Step 2: Update MessageCard to use portraitUrl**

```typescript
// In MessageCard.tsx, pass portraitUrl to Avatar:
<Avatar
  portraitUrl={message.portraitUrl}
  senderName={message.senderName}
  senderColor={message.senderColor}
/>
```

**Step 3: Update ChatPanel props to accept portraitUrl**

```typescript
// In ChatPanel.tsx:
interface ChatPanelProps {
  yDoc: Y.Doc
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string  // ADD THIS
  seatProperties: { key: string; value: string }[]
  selectedTokenProps?: { key: string; value: string }[]
}

// Update handleSend in ChatInput to include portraitUrl in message creation
```

**Step 4: Update ChatInput to include portraitUrl**

```typescript
// In ChatInput.tsx, update message creation:
const textMessage: ChatTextMessage = {
  type: 'text',
  id: crypto.randomUUID(),
  senderId,
  senderName,
  senderColor,
  portraitUrl, // ADD THIS
  content: text,
  timestamp: Date.now()
}

// Same for ChatRollMessage
```

**Step 5: Update App.tsx to pass portraitUrl**

```typescript
// Find ChatPanel usage in App.tsx and add:
<ChatPanel
  yDoc={yDoc}
  senderId={mySeatId!}
  senderName={mySeat.name}
  senderColor={mySeat.color}
  portraitUrl={activeCharacter?.portraitUrl}  // ADD THIS
  seatProperties={seatProperties}
  selectedTokenProps={selectedTokenProps}
/>
```

**Step 6: Test with and without portrait**

Expected:
- If character has portrait → shows image in avatar
- If no portrait → shows colored circle with first letter

**Step 7: Commit portrait support**

```bash
git add src/chat/chatTypes.ts src/chat/MessageCard.tsx src/chat/ChatPanel.tsx src/chat/ChatInput.tsx src/App.tsx
git commit -m "feat(chat): add portrait URL support for message avatars"
```

---

## Task 10: Final Testing and Polish

**Step 1: Test collapsed mode**

1. Start with chat collapsed
2. Send a text message → appears as toast
3. Send 2 more messages → 3 toasts stacked
4. Wait 3 seconds → oldest toast fades out
5. Send 4th message → 3 toasts maintained (oldest removed)

Expected:
- Max 3 toasts visible
- Opacity decreases from bottom to top
- Time-based fade at 2-3s mark
- Smooth enter/exit animations

**Step 2: Test expanded mode**

1. Click input to expand
2. Scroll up to view history
3. Send new message → appears at bottom
4. Check gradient mask at top → should fade smoothly
5. Click ▼ to collapse

Expected:
- 50vh max height
- Smooth scrolling
- Gradient mask visible at top
- New messages have bounce animation
- Collapse button works

**Step 3: Test dice animations**

1. Roll `/r 1d20+5` → single die animation
2. Roll `/r 4d6kh3` → 4 dice, sequential stops, 3 kept (1 crossed out)
3. Roll `/r 2d6+1d8+3` → complex expression
4. Measure total time → should be ≤ 2s

Expected:
- All dice spin together
- Sequential stopping (0.2s apart)
- Landing bounce effect
- Gold total reveal at end
- Dropped dice have line-through

**Step 4: Test edge cases**

1. Very long message text → word wrap works
2. Many messages (50+) → scroll performance good
3. Rapid message spam → toasts don't overlap weirdly
4. Collapse while scrolled up → state preserved
5. Refresh page → message history loads correctly

**Step 5: Visual polish check**

- [ ] Avatar borders consistent
- [ ] Card shadows look good
- [ ] Text colors have good contrast
- [ ] Animations smooth (60fps)
- [ ] No layout shifts
- [ ] Responsive to different screen heights

**Step 6: Performance check**

Open DevTools → Performance tab:
- Record while dice rolling
- Check frame rate stays above 55fps
- Check no long tasks (>50ms)

**Step 7: Commit any final tweaks**

```bash
git add -A
git commit -m "polish(chat): final visual and performance adjustments"
```

---

## Verification

**Manual Testing Checklist:**

- [ ] Collapsed mode: toast notifications appear and fade
- [ ] Expanded mode: full message history with scroll
- [ ] Toggle: click input expands, click ▼ collapses
- [ ] Avatars: show portrait or fallback letter
- [ ] Text messages: proper styling and layout
- [ ] Dice messages: blue border and distinct styling
- [ ] Dice animation: spin → sequential stop → total reveal
- [ ] Timing: total animation ≤ 2 seconds
- [ ] Toast opacity: position-based + time-based fade
- [ ] Scroll mask: gradient fade at top
- [ ] Performance: smooth 60fps throughout
- [ ] Yjs sync: messages sync across clients

**Browser Testing:**

- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (WebKit)

---

## Success Criteria

1. **Collapsible Interface**: Chat can be collapsed to just input + toasts
2. **Enhanced Visuals**: Message cards have avatars, better styling, clear hierarchy
3. **Slot Machine Dice**: Animations feel exciting and suspenseful (≤2s total)
4. **Smooth Performance**: 60fps throughout, no jank
5. **Backward Compatible**: Existing Yjs sync and data model unchanged

---

## Notes for Implementation

- **DRY**: Reuse Avatar component across all message types
- **YAGNI**: Don't add message search, pinning, or other features yet
- **TDD**: Test each animation timing manually with console.log timestamps
- **Frequent Commits**: Each task is one commit (10 commits total)
- **Performance**: Use CSS transforms (not position changes) for animations
- **Accessibility**: Add ARIA labels for collapse button, role="log" for messages

---

## Estimated Time

- Task 1-4: Component creation (~30 min)
- Task 5: ChatPanel refactor (~20 min)
- Task 6-7: Dice animation (~30 min)
- Task 8-9: Cleanup and portraits (~20 min)
- Task 10: Testing and polish (~30 min)

**Total: ~2.5 hours**
