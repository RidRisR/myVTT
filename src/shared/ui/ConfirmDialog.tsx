import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Auto-focus cancel button on mount
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onCancel])

  // Focus trap: keep focus within dialog
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first && last) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last && first) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleFocusTrap)
    return () => {
      document.removeEventListener('keydown', handleFocusTrap)
    }
  }, [])

  const confirmColorClass =
    variant === 'danger'
      ? 'bg-danger hover:bg-danger/80'
      : 'bg-warning hover:bg-warning/80 text-deep'

  return (
    // Overlay
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-deep/80 backdrop-blur-[4px]"
      onClick={onCancel}
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      {/* Dialog card */}
      <div
        ref={dialogRef}
        className="mx-4 max-w-sm w-full rounded-lg border border-border-glass bg-glass p-6 shadow-xl shadow-black/40 backdrop-blur-[12px]"
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        {/* Title */}
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-text-primary mb-2">
          {title}
        </h2>

        {/* Message */}
        <p id="confirm-dialog-message" className="text-sm text-text-muted mb-6 leading-relaxed">
          {message}
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-md border border-border-glass bg-transparent px-4 py-2 text-sm font-medium text-text-muted transition-colors duration-fast hover:bg-hover hover:text-text-primary motion-reduce:transition-none"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={[
              'rounded-md px-4 py-2 text-sm font-medium text-text-primary',
              'transition-colors duration-fast motion-reduce:transition-none',
              confirmColorClass,
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
