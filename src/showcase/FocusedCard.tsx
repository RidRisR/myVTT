import { useEffect, useRef } from 'react'
import type { ShowcaseItem } from '../shared/showcaseTypes'

interface FocusedCardProps {
  item: ShowcaseItem
  isGM: boolean
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

    cardRef.current.animate(
      [
        { transform: 'scale(0.7)', opacity: 0, filter: 'blur(12px)' },
        { transform: 'scale(1.05)', opacity: 1, filter: 'blur(0px)', offset: 0.6 },
        { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' },
      ],
      {
        duration: 650,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        fill: 'forwards',
      },
    ).onfinish = () => {
      onAnimationDone()
    }
  }, [animateEntrance, item.id, onAnimationDone])

  const canDismiss = !isPinned
  const canPin = isGM && !isPinned
  const canUnpin = isGM && isPinned
  const canDelete = isGM

  if (item.type === 'text') {
    return (
      <div ref={cardRef} className="text-center max-w-[600px] px-8 py-5">
        <div
          className="italic text-2xl leading-relaxed text-white whitespace-pre-wrap"
          style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            textShadow: '0 0 20px rgba(255,255,255,0.4), 0 0 40px rgba(255,255,255,0.15)',
          }}
        >
          {item.text}
        </div>
        <div className="mt-3 text-[11px] text-text-muted/40 font-sans">
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
    <div ref={cardRef} className="flex flex-col items-center gap-3">
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.title || ''}
          className="max-w-[55vw] object-contain rounded shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
          style={{
            maxHeight: item.title || item.description ? '50vh' : '55vh',
          }}
        />
      )}
      {(item.title || item.description) && (
        <div className="text-center max-w-[55vw] font-sans">
          {item.title && (
            <div
              className="text-base font-semibold text-white"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}
            >
              {item.title}
            </div>
          )}
          {item.description && (
            <div
              className="text-[13px] text-text-primary/70 leading-normal"
              style={{
                marginTop: item.title ? 4 : 0,
                textShadow: '0 1px 6px rgba(0,0,0,0.5)',
              }}
            >
              {item.description}
            </div>
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

function ActionButtons({
  canDismiss,
  canPin,
  canUnpin,
  canDelete,
  onDismiss,
  onPin,
  onUnpin,
  onDelete,
}: {
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

  const btnBase =
    'px-3 py-1 border border-border-glass rounded-md text-[11px] font-medium cursor-pointer font-sans bg-surface transition-colors duration-fast'

  return (
    <div className="mt-3 flex gap-2 justify-center">
      {canDismiss && (
        <button onClick={onDismiss} className={`${btnBase} text-text-primary/70 hover:bg-hover`}>
          Dismiss
        </button>
      )}
      {canPin && (
        <button
          onClick={onPin}
          className={`${btnBase} border-accent/40 text-accent hover:bg-accent/10`}
        >
          Pin
        </button>
      )}
      {canUnpin && (
        <button
          onClick={onUnpin}
          className={`${btnBase} border-accent/40 text-accent hover:bg-accent/10`}
        >
          Unpin
        </button>
      )}
      {canDelete && (
        <button
          onClick={onDelete}
          className={`${btnBase} border-danger/40 text-danger hover:bg-danger/10`}
        >
          Delete
        </button>
      )}
    </div>
  )
}
