import { useEffect, useRef } from 'react'
import type { ShowcaseItem } from './showcaseTypes'

interface FocusedCardProps {
  item: ShowcaseItem
  isGM: boolean
  mySeatId: string
  isPinned: boolean
  animateEntrance: boolean
  onAnimationDone: () => void
  onDismiss: () => void
  onPin: () => void
  onUnpin: () => void
  onDelete: () => void
}

export function FocusedCard({
  item,
  isGM,
  mySeatId,
  isPinned,
  animateEntrance,
  onAnimationDone,
  onDismiss,
  onPin,
  onUnpin,
  onDelete,
}: FocusedCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const prevAnimatedId = useRef<string | null>(null)

  // Web Animations API entrance
  useEffect(() => {
    if (!animateEntrance || !cardRef.current) return
    if (prevAnimatedId.current === item.id) return
    prevAnimatedId.current = item.id

    cardRef.current.animate([
      { transform: 'scale(0.7)', opacity: 0, filter: 'blur(12px)' },
      { transform: 'scale(1.05)', opacity: 1, filter: 'blur(0px)', offset: 0.6 },
      { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' },
    ], {
      duration: 650,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      fill: 'forwards',
    }).onfinish = () => onAnimationDone()
  }, [animateEntrance, item.id])

  const canDismiss = !isPinned
  const canPin = isGM && !isPinned
  const canUnpin = isGM && isPinned
  const canDelete = isGM

  if (item.type === 'text') {
    return (
      <div ref={cardRef} style={{ textAlign: 'center', maxWidth: 600, padding: '20px 32px' }}>
        <div style={{
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontStyle: 'italic',
          fontSize: 24,
          lineHeight: 1.6,
          color: '#fff',
          textShadow: '0 0 20px rgba(255,255,255,0.4), 0 0 40px rgba(255,255,255,0.15)',
          whiteSpace: 'pre-wrap',
        }}>
          {item.text}
        </div>
        <div style={{
          marginTop: 12,
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          fontFamily: 'sans-serif',
        }}>
          <span style={{ color: item.senderColor }}>{item.senderName}</span>
        </div>
        <ActionButtons
          canDismiss={canDismiss}
          canPin={canPin}
          canUnpin={canUnpin}
          canDelete={canDelete}
          onDismiss={onDismiss}
          onPin={onPin}
          onUnpin={onUnpin}
          onDelete={onDelete}
        />
      </div>
    )
  }

  // image / handout type — raw image, no card wrapper
  return (
    <div ref={cardRef} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    }}>
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.title || ''}
          style={{
            maxWidth: '55vw',
            maxHeight: (item.title || item.description) ? '50vh' : '55vh',
            objectFit: 'contain',
            borderRadius: 4,
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          }}
        />
      )}
      {(item.title || item.description) && (
        <div style={{
          textAlign: 'center',
          maxWidth: '55vw',
          fontFamily: 'sans-serif',
        }}>
          {item.title && (
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#fff',
              textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            }}>{item.title}</div>
          )}
          {item.description && (
            <div style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.5,
              marginTop: item.title ? 4 : 0,
              textShadow: '0 1px 6px rgba(0,0,0,0.5)',
            }}>{item.description}</div>
          )}
        </div>
      )}
      <ActionButtons
        canDismiss={canDismiss}
        canPin={canPin}
        canUnpin={canUnpin}
        canDelete={canDelete}
        onDismiss={onDismiss}
        onPin={onPin}
        onUnpin={onUnpin}
        onDelete={onDelete}
      />
    </div>
  )
}

function ActionButtons({ canDismiss, canPin, canUnpin, canDelete, onDismiss, onPin, onUnpin, onDelete }: {
  canDismiss: boolean
  canPin: boolean
  canUnpin: boolean
  canDelete: boolean
  onDismiss: () => void
  onPin: () => void
  onUnpin: () => void
  onDelete: () => void
}) {
  if (!canDismiss && !canPin && !canUnpin && !canDelete) return null

  const btnBase: React.CSSProperties = {
    padding: '5px 12px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.7)',
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
      {canDismiss && (
        <button
          onClick={onDismiss}
          style={btnBase}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        >
          Dismiss
        </button>
      )}
      {canPin && (
        <button
          onClick={onPin}
          style={{ ...btnBase, borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(251,191,36,0.12)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        >
          Pin
        </button>
      )}
      {canUnpin && (
        <button
          onClick={onUnpin}
          style={{ ...btnBase, borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(251,191,36,0.12)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        >
          Unpin
        </button>
      )}
      {canDelete && (
        <button
          onClick={onDelete}
          style={{ ...btnBase, borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        >
          Delete
        </button>
      )}
    </div>
  )
}
