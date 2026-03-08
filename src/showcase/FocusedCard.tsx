import { useEffect, useRef } from 'react'
import type { ShowcaseItem } from './showcaseTypes'

interface FocusedCardProps {
  item: ShowcaseItem
  isGM: boolean
  mySeatId: string
  animateEntrance: boolean
  onAnimationDone: () => void
  onDismiss: () => void
  onPin: () => void
  onDelete: () => void
}

export function FocusedCard({
  item,
  isGM,
  mySeatId,
  animateEntrance,
  onAnimationDone,
  onDismiss,
  onPin,
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

  const canDismiss = isGM || item.senderId === mySeatId
  const canPin = isGM && item.ephemeral
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
          {item.ephemeral && <span style={{ marginLeft: 8, opacity: 0.6 }}>ephemeral</span>}
        </div>
        <ActionButtons
          canDismiss={canDismiss}
          canPin={canPin}
          canDelete={canDelete}
          onDismiss={onDismiss}
          onPin={onPin}
          onDelete={onDelete}
        />
      </div>
    )
  }

  // image / handout type
  return (
    <div ref={cardRef} style={{
      background: 'rgba(15, 15, 25, 0.92)',
      backdropFilter: 'blur(20px)',
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      maxWidth: '60vw',
      maxHeight: '70vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.title || ''}
          style={{
            width: '100%',
            maxHeight: '50vh',
            objectFit: 'contain',
            borderRadius: '16px 16px 0 0',
          }}
        />
      )}
      <div style={{ padding: '16px 20px' }}>
        {item.title && (
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: '#fff',
            fontFamily: 'sans-serif',
            marginBottom: item.description ? 8 : 0,
          }}>
            {item.title}
          </div>
        )}
        {item.description && (
          <div style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.65)',
            fontFamily: 'sans-serif',
            lineHeight: 1.5,
            maxHeight: 120,
            overflowY: 'auto',
          }}>
            {item.description}
          </div>
        )}
        <div style={{
          marginTop: 10,
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          fontFamily: 'sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{
            width: 8, height: 8,
            borderRadius: '50%',
            background: item.senderColor,
            display: 'inline-block',
          }} />
          {item.senderName}
          {item.ephemeral && <span style={{ marginLeft: 8, opacity: 0.6 }}>ephemeral</span>}
        </div>
        <ActionButtons
          canDismiss={canDismiss}
          canPin={canPin}
          canDelete={canDelete}
          onDismiss={onDismiss}
          onPin={onPin}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

function ActionButtons({ canDismiss, canPin, canDelete, onDismiss, onPin, onDelete }: {
  canDismiss: boolean
  canPin: boolean
  canDelete: boolean
  onDismiss: () => void
  onPin: () => void
  onDelete: () => void
}) {
  if (!canDismiss && !canPin && !canDelete) return null

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
