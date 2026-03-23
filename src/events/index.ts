// src/events/index.ts
export { EventBus, EventHandle, defineEvent, createEventBus, eventBus, useEvent } from './eventBus'
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
