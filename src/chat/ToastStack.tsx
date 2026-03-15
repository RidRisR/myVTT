import { useEffect, useState, useRef } from 'react'
import type { ChatMessage } from './chatTypes'
import { MessageCard } from './MessageCard'

export interface ToastItem {
  message: ChatMessage
  timestamp: number
}

interface ToastStackProps {
  toastQueue: ToastItem[]
  onRemove: (id: string) => void
}

const MAX_TOASTS = 3
const TOAST_LIFETIME = 8000 // 8 seconds
const FADE_START = 6000 // Start fading at 6s

// Position-based opacity: newest (bottom) = 1.0, oldest (top) = 0.4
const POSITION_OPACITY = [1.0, 0.7, 0.4]

export function ToastStack({ toastQueue, onRemove }: ToastStackProps) {
  const [, forceUpdate] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined)

  // Tick every 100ms to update time-based opacity smoothly
  useEffect(() => {
    if (toastQueue.length === 0) return
    tickRef.current = setInterval(() => {
      forceUpdate((n) => n + 1)
    }, 100)
    return () => {
      clearInterval(tickRef.current)
    }
  }, [toastQueue.length])

  // Auto-remove expired toasts
  useEffect(() => {
    const now = Date.now()
    for (const item of toastQueue) {
      if (now - item.timestamp >= TOAST_LIFETIME) {
        onRemove(item.message.id)
      }
    }
  })

  if (toastQueue.length === 0) return null

  const visibleToasts = toastQueue.slice(-MAX_TOASTS)
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
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: 68,
          right: 16,
          width: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          zIndex: 10000,
        }}
      >
        {visibleToasts.map((item, i) => {
          const elapsed = now - item.timestamp
          const isNew = elapsed < 300

          // Position-based: 0 = top (oldest), last = bottom (newest)
          const reverseIndex = visibleToasts.length - 1 - i
          const positionOpacity = POSITION_OPACITY[reverseIndex] ?? 0.4

          // Time-based fade
          let timeFade = 1.0
          if (elapsed >= FADE_START && elapsed < TOAST_LIFETIME) {
            timeFade = 1 - (elapsed - FADE_START) / (TOAST_LIFETIME - FADE_START)
          } else if (elapsed >= TOAST_LIFETIME) {
            timeFade = 0
          }

          const finalOpacity = positionOpacity * timeFade

          return (
            <div
              key={item.message.id}
              style={{
                opacity: finalOpacity,
                pointerEvents: 'auto',
                transition: 'opacity 0.15s ease-out, transform 0.3s ease-out',
              }}
            >
              <MessageCard message={item.message} isNew={isNew} animationStyle="toast" />
            </div>
          )
        })}
      </div>
    </>
  )
}
