// src/events/useSystemEvents.ts
// Bridge: subscribes to system events on the EventBus and routes them to UI implementations.
// Call this hook once from a root-level component (e.g. App or RoomView).
import { useRef } from 'react'
import { useEvent, eventBus } from './eventBus'
import { toastEvent, announceEvent } from './systemEvents'
import { useToast } from '../ui/useToast'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import type { ToastType } from '../ui/Toast'

export function useSystemEvents(): void {
  const { toast } = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast

  useEvent(toastEvent, (payload) => {
    const variant = (payload.variant ?? 'info') as ToastType
    toastRef.current(variant, payload.text, payload.durationMs ? { duration: payload.durationMs } : undefined)
  }, eventBus)

  useEvent(announceEvent, (payload) => {
    const seat = useIdentityStore.getState().getMySeat()
    void useWorldStore.getState().sendMessage({
      senderId: seat?.id ?? '',
      senderName: seat?.name ?? 'Unknown',
      senderColor: seat?.color ?? '#888888',
      content: payload.message,
    })
  }, eventBus)

  // animationEvent and soundEvent: no-op for now (no UI implementation yet)
}
