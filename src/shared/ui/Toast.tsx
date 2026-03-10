import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'undo'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastData {
  id: string
  type: ToastType
  message: string
  action?: ToastAction
  duration: number
}

interface ToastProps {
  toast: ToastData
  onDismiss: (id: string) => void
}

const icons: Record<ToastType, string> = {
  success:
    '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 12l2.5 2.5L16 9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  error:
    '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  warning:
    '<path d="M12 2L2 22h20L12 2z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M12 10v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="18" r="1" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 8v0M12 12v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  undo: '<path d="M3 7v6h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 13a9 9 0 1 0 2.1-5.4L3 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
}

const typeColorClasses: Record<ToastType, string> = {
  success: 'border-success text-success',
  error: 'border-danger text-danger',
  warning: 'border-warning text-warning',
  info: 'border-info text-info',
  undo: 'border-accent text-accent',
}

const actionButtonClasses: Record<ToastType, string> = {
  success: 'bg-success hover:bg-success/80',
  error: 'bg-danger hover:bg-danger/80',
  warning: 'bg-warning hover:bg-warning/80 text-deep',
  info: 'bg-info hover:bg-info/80',
  undo: 'bg-accent hover:bg-accent/80 text-deep',
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    // Trigger enter animation on next frame
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss()
    }, toast.duration)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.duration, toast.id])

  const handleDismiss = () => {
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 250)
  }

  const colorClasses = typeColorClasses[toast.type]

  return (
    <div
      role="alert"
      className={[
        'pointer-events-auto flex items-center gap-3 rounded-lg border bg-glass px-4 py-3',
        'backdrop-blur-[12px] shadow-lg shadow-black/30',
        'transition-all duration-normal',
        'motion-reduce:transition-none',
        colorClasses,
        visible && !exiting ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0',
      ].join(' ')}
    >
      {/* Icon */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        className="shrink-0"
        dangerouslySetInnerHTML={{ __html: icons[toast.type] }}
        aria-hidden="true"
      />

      {/* Message */}
      <span className="text-sm text-text-primary flex-1 min-w-0">{toast.message}</span>

      {/* Action button (for undo type) */}
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.onClick()
            handleDismiss()
          }}
          className={[
            'shrink-0 rounded px-2.5 py-1 text-xs font-semibold',
            'transition-colors duration-fast',
            'motion-reduce:transition-none',
            actionButtonClasses[toast.type],
          ].join(' ')}
        >
          {toast.action.label}
        </button>
      )}

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded p-1 text-text-muted hover:text-text-primary hover:bg-hover transition-colors duration-fast motion-reduce:transition-none"
        aria-label="Close notification"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
