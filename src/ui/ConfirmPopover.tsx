import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

interface ConfirmPopoverProps {
  /** The element the popover anchors to */
  anchorRef: React.RefObject<HTMLElement | null>
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A small bubble popover that appears above the anchor element.
 * Rendered via portal to avoid overflow clipping.
 */
export function ConfirmPopover({
  anchorRef,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmPopoverProps) {
  const { t } = useTranslation('ui')
  const resolvedConfirmLabel = confirmLabel ?? t('delete_default')
  const resolvedCancelLabel = cancelLabel ?? t('cancel_default')
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Position the popover above the anchor
  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPos({
      top: rect.top,
      left: rect.left + rect.width / 2,
    })
  }, [anchorRef])

  // Close on click outside
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => {
      document.removeEventListener('pointerdown', handler)
    }
  }, [onCancel])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [onCancel])

  if (!pos) return null

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-toast font-sans animate-[popover-in_150ms_ease-out]"
      style={{
        top: pos.top - 8,
        left: pos.left,
        transform: 'translate(-50%, -100%)',
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
    >
      {/* Bubble */}
      <div className="bg-surface border border-border-glass rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] px-3 py-2.5 min-w-[140px]">
        <p className="text-xs text-text-primary mb-2.5 whitespace-nowrap">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            data-testid="confirm-cancel"
            onClick={onCancel}
            className="text-[11px] text-text-muted px-2 py-1 rounded hover:bg-hover cursor-pointer transition-colors duration-fast"
          >
            {resolvedCancelLabel}
          </button>
          <button
            data-testid="confirm-action"
            onClick={onConfirm}
            className="text-[11px] text-white bg-danger px-2.5 py-1 rounded hover:bg-danger/80 cursor-pointer transition-colors duration-fast"
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
      {/* Arrow pointing down */}
      <div
        className="w-0 h-0 mx-auto"
        style={{
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid rgb(var(--color-surface))',
        }}
      />
    </div>,
    document.body,
  )
}
