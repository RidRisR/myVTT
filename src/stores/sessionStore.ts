// src/stores/sessionStore.ts
// Client-only session state: UI selection + pending interactions (Phase 6).
import { create } from 'zustand'

export interface PendingInteraction {
  interactionId: string
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

interface SessionState {
  selection: string[]
  pendingInteractions: Map<string, PendingInteraction>
}

export const useSessionStore = create<SessionState>(() => ({
  selection: [],
  pendingInteractions: new Map(),
}))

// Write function — only called by core:set-selection workflow step
export function _setSelection(entityIds: string[]): void {
  useSessionStore.setState({ selection: entityIds })
}

// Phase 6: requestInput / resolveInput / cancelInput
export function requestInput(interactionId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    useSessionStore.setState((s) => {
      const next = new Map(s.pendingInteractions)
      next.set(interactionId, { interactionId, resolve, reject })
      return { pendingInteractions: next }
    })
  })
}

export function resolveInput(interactionId: string, value: unknown): void {
  const pending = useSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.resolve(value)
  useSessionStore.setState((s) => {
    const next = new Map(s.pendingInteractions)
    next.delete(interactionId)
    return { pendingInteractions: next }
  })
}

export function cancelInput(interactionId: string): void {
  const pending = useSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.reject(new Error('cancelled'))
  useSessionStore.setState((s) => {
    const next = new Map(s.pendingInteractions)
    next.delete(interactionId)
    return { pendingInteractions: next }
  })
}
