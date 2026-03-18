import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, Undo2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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

const IconMap: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  undo: Undo2,
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
  const { t } = useTranslation('common')
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    // Trigger enter animation on next frame
    const frame = requestAnimationFrame(() => {
      setVisible(true)
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss()
    }, toast.duration)
    return () => {
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.duration, toast.id])

  const handleDismiss = () => {
    setExiting(true)
    setTimeout(() => {
      onDismiss(toast.id)
    }, 250)
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
      {(() => {
        const Icon = IconMap[toast.type]
        return <Icon size={20} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
      })()}

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
        aria-label={t('close')}
      >
        <X size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}
