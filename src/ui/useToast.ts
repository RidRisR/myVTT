import { createContext, useContext } from 'react'
import type { ToastType, ToastAction } from './Toast.tsx'

export interface ToastOptions {
  duration?: number
  action?: ToastAction
}

export interface ToastContextValue {
  toast: (type: ToastType, message: string, options?: ToastOptions) => string
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
