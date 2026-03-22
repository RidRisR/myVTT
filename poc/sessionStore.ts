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

export const usePocSessionStore = create<SessionState>(() => ({
  selection: [],
  pendingInteractions: new Map(),
}))

// Write function — only for core:set-selection workflow step
export function _setSelection(entityIds: string[]) {
  usePocSessionStore.setState({ selection: entityIds })
}

export function requestInput(interactionId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    usePocSessionStore.setState((s) => {
      const next = new Map(s.pendingInteractions)
      next.set(interactionId, { interactionId, resolve, reject })
      return { pendingInteractions: next }
    })
  })
}

export function resolveInput(interactionId: string, value: unknown): void {
  const pending = usePocSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.resolve(value)
  usePocSessionStore.setState((s) => {
    const next = new Map(s.pendingInteractions)
    next.delete(interactionId)
    return { pendingInteractions: next }
  })
}

export function cancelInput(interactionId: string): void {
  const pending = usePocSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.reject(new Error('cancelled'))
  usePocSessionStore.setState((s) => {
    const next = new Map(s.pendingInteractions)
    next.delete(interactionId)
    return { pendingInteractions: next }
  })
}
