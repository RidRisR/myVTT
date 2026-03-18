import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Toast } from './Toast.tsx'
import type { ToastType } from './Toast.tsx'
import { ToastContext } from './useToast.ts'
import type { ToastOptions } from './useToast.ts'

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 4000,
  error: 4000,
  warning: 4000,
  info: 4000,
  undo: 5000,
}

const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<
    {
      id: string
      type: ToastType
      message: string
      action?: { label: string; onClick: () => void }
      duration: number
    }[]
  >([])
  const counterRef = useRef(0)

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions): string => {
      const id = `toast-${++counterRef.current}`
      const duration = options?.duration ?? DEFAULT_DURATION[type]

      setToasts((prev) => {
        const next = [...prev, { id, type, message, action: options?.action, duration }]
        // FIFO: keep only the latest MAX_VISIBLE
        if (next.length > MAX_VISIBLE) {
          return next.slice(next.length - MAX_VISIBLE)
        }
        return next
      })

      return id
    },
    [],
  )

  return (
    <ToastContext.Provider value={{ toast: addToast, dismiss }}>
      {children}
      {/* Toast container — fixed bottom-right */}
      <div
        className="fixed bottom-4 right-4 z-toast flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-relevant="additions removals"
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
