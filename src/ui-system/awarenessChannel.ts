// src/ui-system/awarenessChannel.ts

/** Typed token for an awareness channel. Type info exists only at compile time. */
export interface AwarenessChannel<T> {
  readonly key: string
  readonly __phantom?: T
}

/** Create a typed awareness channel token. */
export function createAwarenessChannel<T>(key: string): AwarenessChannel<T> {
  return { key } as AwarenessChannel<T>
}

type AwarenessHandler = (seatId: string, state: unknown) => void

interface ChannelBroadcastData {
  channel: string
  payload: unknown
  seatId: string
}

interface ChannelClearData {
  channel: string
  seatId: string
}

// Key: "channel\0seatId"
function ttlKey(channel: string, seatId: string): string {
  return `${channel}\0${seatId}`
}

const DEFAULT_TTL_MS = 5000

type SocketEmit = (event: string, data: unknown) => void

/**
 * Client-side awareness channel manager.
 * Manages subscriptions, broadcasts, and TTL-based auto-expiry.
 */
export class AwarenessManager {
  private emit: SocketEmit
  private subscribers = new Map<string, Set<AwarenessHandler>>()
  private ttlTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // Track which channels each seat has active state in (for handleRemove)
  private activeSeatChannels = new Map<string, Set<string>>() // seatId → Set<channel>

  constructor(emit: SocketEmit) {
    this.emit = emit
  }

  /** Subscribe to a channel. Returns unsubscribe function. */
  subscribe<T>(
    channel: AwarenessChannel<T>,
    handler: (seatId: string, state: T | null) => void,
  ): () => void {
    const handlers = this.subscribers.get(channel.key) ?? new Set()
    handlers.add(handler as AwarenessHandler)
    this.subscribers.set(channel.key, handlers)
    return () => {
      handlers.delete(handler as AwarenessHandler)
      if (handlers.size === 0) this.subscribers.delete(channel.key)
    }
  }

  /** Broadcast state to other clients via server relay. */
  broadcast<T>(channel: AwarenessChannel<T>, data: T): void {
    this.emit('awareness:ch:broadcast', {
      channel: channel.key,
      payload: data,
    })
  }

  /** Clear state immediately. */
  clear(channel: AwarenessChannel<unknown>): void {
    this.emit('awareness:ch:clear', {
      channel: channel.key,
    })
  }

  /** Handle incoming broadcast from server. Call from socket listener. */
  handleIncoming(
    event: 'awareness:ch:broadcast' | 'awareness:ch:clear',
    data: ChannelBroadcastData | ChannelClearData,
  ): void {
    if (event === 'awareness:ch:broadcast') {
      const { channel, payload, seatId } = data as ChannelBroadcastData
      this.notifySubscribers(channel, seatId, payload)
      this.resetTTL(channel, seatId)
      const channels = this.activeSeatChannels.get(seatId) ?? new Set()
      channels.add(channel)
      this.activeSeatChannels.set(seatId, channels)
    } else {
      const { channel, seatId } = data as ChannelClearData
      this.notifySubscribers(channel, seatId, null)
      this.clearTTL(channel, seatId)
      this.activeSeatChannels.get(seatId)?.delete(channel)
    }
  }

  /** Handle seat disconnect — clear all channels for that seat. */
  handleRemove(seatId: string): void {
    const channels = this.activeSeatChannels.get(seatId)
    if (!channels) return
    for (const channel of channels) {
      this.notifySubscribers(channel, seatId, null)
      this.clearTTL(channel, seatId)
    }
    this.activeSeatChannels.delete(seatId)
  }

  /** Clean up all timers. */
  dispose(): void {
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer)
    }
    this.ttlTimers.clear()
    this.subscribers.clear()
    this.activeSeatChannels.clear()
  }

  private notifySubscribers(channel: string, seatId: string, state: unknown): void {
    const handlers = this.subscribers.get(channel)
    if (!handlers) return
    for (const handler of handlers) {
      handler(seatId, state)
    }
  }

  private resetTTL(channel: string, seatId: string): void {
    const key = ttlKey(channel, seatId)
    const existing = this.ttlTimers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.notifySubscribers(channel, seatId, null)
      this.ttlTimers.delete(key)
      this.activeSeatChannels.get(seatId)?.delete(channel)
    }, DEFAULT_TTL_MS)
    this.ttlTimers.set(key, timer)
  }

  private clearTTL(channel: string, seatId: string): void {
    const key = ttlKey(channel, seatId)
    const timer = this.ttlTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.ttlTimers.delete(key)
    }
  }
}
