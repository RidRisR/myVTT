// src/events/systemEvents.ts
import { defineEvent } from './eventBus'

export interface ToastPayload {
  text: string
  variant?: 'info' | 'success' | 'warning' | 'error'
  durationMs?: number
}

export interface AnnouncePayload {
  message: string
}

export interface AnimationPayload {
  type: string
  data?: Record<string, unknown>
  durationMs?: number
}

export interface SoundPayload {
  sound: string
}

export const toastEvent = defineEvent<ToastPayload>('system:toast')
export const announceEvent = defineEvent<AnnouncePayload>('system:announce')
export const animationEvent = defineEvent<AnimationPayload>('system:animation')
export const soundEvent = defineEvent<SoundPayload>('system:sound')
