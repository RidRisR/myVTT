// src/events/index.ts
export { EventBus, defineEvent, createEventBus, eventBus, useEvent } from './eventBus'
export type { EventHandle } from './eventBus'
export {
  toastEvent,
  announceEvent,
  animationEvent,
  soundEvent,
  type ToastPayload,
  type AnnouncePayload,
  type AnimationPayload,
  type SoundPayload,
} from './systemEvents'
