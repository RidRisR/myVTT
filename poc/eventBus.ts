import { useRef, useEffect } from 'react'

export interface EventHandle<T = unknown> {
  key: string
  __type?: T
}

export function defineEvent<T>(key: string): EventHandle<T> {
  return { key }
}

type Handler = (payload: unknown) => void

export class EventBus {
  private handlers = new Map<string, Set<Handler>>()

  on<T>(handle: EventHandle<T>, handler: (payload: T) => void): () => void {
    const key = handle.key
    if (!this.handlers.has(key)) this.handlers.set(key, new Set())
    const h = handler as Handler
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by has() check above
    this.handlers.get(key)!.add(h)
    return () => {
      this.handlers.get(key)?.delete(h)
    }
  }

  emit<T>(handle: EventHandle<T>, payload: T): void {
    this.handlers.get(handle.key)?.forEach((h) => {
      try {
        h(payload as unknown)
      } catch (e) {
        console.error(`[EventBus] handler error for "${handle.key}":`, e)
      }
    })
  }
}

export function createEventBus(): EventBus {
  return new EventBus()
}

export const eventBus = new EventBus()

export function useEvent<T>(
  handle: EventHandle<T>,
  handler: (payload: T) => void,
  bus: EventBus = eventBus,
): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  useEffect(() => bus.on(handle, (p) => handlerRef.current(p)), [handle.key, bus])
}
