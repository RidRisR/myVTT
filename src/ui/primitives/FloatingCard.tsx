import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useClickOutside } from '../../hooks/useClickOutside'

export interface FloatingCardProps {
  /** Positioning mode: anchored below a target element, or floating at absolute coords */
  mode: 'anchored' | 'floating'
  /** anchored mode: DOMRect of the target element to position below */
  anchor?: DOMRect | null
  /** floating mode: absolute screen position */
  position?: { x: number; y: number }
  /** Enable drag — any non-interactive surface becomes draggable */
  draggable?: boolean
  /** How this card should be dismissed */
  dismissOn: 'mouseleave' | 'clickoutside' | 'manual'
  /** Called when the card should close */
  onClose: () => void
  /** Called when drag ends with the final position */
  onDragEnd?: (pos: { x: number; y: number }) => void
  /** Mouse enter/leave forwarded to consumer for hover timer management */
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  /** Card width in px */
  width?: number
  className?: string
  children: ReactNode
}

const SIDE_OFFSET = 8
const COLLISION_PADDING = 8
const DEFAULT_WIDTH = 260

/**
 * Compute left/top for anchored mode: centered below the anchor DOMRect.
 * Clamps to viewport edges with collision padding.
 */
function anchoredPosition(anchor: DOMRect, width: number) {
  let left = anchor.left + anchor.width / 2 - width / 2
  let top = anchor.bottom + SIDE_OFFSET

  // Clamp horizontal
  if (left < COLLISION_PADDING) left = COLLISION_PADDING
  if (left + width > window.innerWidth - COLLISION_PADDING) {
    left = window.innerWidth - COLLISION_PADDING - width
  }

  // Clamp vertical
  if (top < COLLISION_PADDING) top = COLLISION_PADDING

  return { x: left, y: top }
}

/**
 * Generic floating card primitive using position: fixed + left/top.
 *
 * NEVER uses transform for positioning (CSS containing block pitfall).
 * Renders via createPortal to document.body to escape any parent transforms.
 *
 * Drag pattern from PatternFloatingPanelOverlay: posRef for stable callback,
 * dragCleanupRef for unmount safety.
 */
export function FloatingCard({
  mode,
  anchor,
  position,
  draggable = false,
  dismissOn,
  onClose,
  onDragEnd,
  onMouseEnter,
  onMouseLeave,
  width,
  className,
  children,
}: FloatingCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  // Compute initial position based on mode
  const initialPos =
    mode === 'anchored' && anchor
      ? anchoredPosition(anchor, width ?? DEFAULT_WIDTH)
      : (position ?? { x: 100, y: 100 })

  // posRef holds authoritative position (read by drag handler).
  // pos state drives React re-renders.
  const posRef = useRef(initialPos)
  const [pos, setPos] = useState(initialPos)

  // Update position when anchor changes (anchored mode only, when not dragging)
  useEffect(() => {
    if (mode === 'anchored' && anchor && !dragCleanupRef.current) {
      const next = anchoredPosition(anchor, width ?? DEFAULT_WIDTH)
      posRef.current = next
      setPos(next)
    }
  }, [mode, anchor, width])

  // Update position when position prop changes (floating mode)
  useEffect(() => {
    if (mode === 'floating' && position) {
      posRef.current = position
      setPos(position)
    }
  }, [mode, position])

  // Click-outside dismiss
  useClickOutside(cardRef, onClose, dismissOn === 'clickoutside')

  // Clean up drag listeners on unmount
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
    }
  }, [])

  // Stable drag handler — no dependencies on pos (reads from ref)
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (!draggable) return
      // Don't drag when clicking interactive elements
      if (
        (e.target as HTMLElement).closest(
          'button, input, select, textarea, [data-radix-popper-content-wrapper]',
        )
      ) {
        return
      }
      e.preventDefault()
      const startX = e.clientX - posRef.current.x
      const startY = e.clientY - posRef.current.y

      const onMove = (ev: PointerEvent) => {
        const next = { x: ev.clientX - startX, y: ev.clientY - startY }
        posRef.current = next
        setPos(next)
      }
      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        dragCleanupRef.current = null
        onDragEnd?.(posRef.current)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      dragCleanupRef.current = onUp
    },
    [draggable, onDragEnd],
  )

  const card = (
    <div
      ref={cardRef}
      className={[
        // fixed! / z-popover! use Tailwind v4 !important modifier so consumer
        // className can never accidentally override positioning or stacking.
        'fixed! z-popover!',
        'rounded-xl border border-border-glass bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]',
        'animate-[radix-popover-in_150ms_ease-out]',
        draggable && 'cursor-grab active:cursor-grabbing',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: pos.x,
        top: pos.y,
        width,
      }}
      onClick={(e) => {
        e.stopPropagation()
      }}
      // Capture phase: fires root-first so child stopPropagation can't block drag.
      onPointerDownCapture={handleDragStart}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
      onWheel={(e) => {
        e.stopPropagation()
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  )

  return createPortal(card, document.body)
}
