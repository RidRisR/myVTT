// src/stores/sessionStore.ts
// Client-only session state: UI selection + pending interactions.
import { create } from 'zustand'
import type { InputResult, RequestInputOptions } from '../ui-system/inputHandlerTypes'
import { uuidv7 } from '../shared/uuidv7'

export interface PendingInteraction {
  interactionId: string
  inputType: string
  context: unknown
  /** Called with the user's value — resolves the outer promise as { ok: true, value } */
  complete: (value: unknown) => void
  /** Called on cancel — resolves the outer promise as { ok: false, reason: 'cancelled' } */
  cancel: () => void
}

interface SessionState {
  selection: string[]
  pendingInteractions: Map<string, PendingInteraction>
}

export const useSessionStore = create<SessionState>(() => ({
  selection: [],
  pendingInteractions: new Map(),
}))

export function _setSelection(entityIds: string[]): void {
  useSessionStore.setState({ selection: entityIds })
}

export function requestInput<TResult = unknown>(
  inputType: string,
  options?: RequestInputOptions,
): Promise<InputResult<TResult>> {
  const interactionId = uuidv7()

  return new Promise<InputResult<TResult>>((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const removePending = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      useSessionStore.setState((s) => {
        const next = new Map(s.pendingInteractions)
        next.delete(interactionId)
        return { pendingInteractions: next }
      })
    }

    const pending: PendingInteraction = {
      interactionId,
      inputType,
      context: options?.context,
      complete: (value: unknown) => {
        removePending()
        resolve({ ok: true, value: value as TResult })
      },
      cancel: () => {
        removePending()
        resolve({ ok: false, reason: 'cancelled' })
      },
    }

    useSessionStore.setState((s) => {
      const next = new Map(s.pendingInteractions)
      next.set(interactionId, pending)
      return { pendingInteractions: next }
    })

    if (options?.timeout !== undefined) {
      timeoutId = setTimeout(() => {
        removePending()
        resolve({ ok: false, reason: 'timeout' })
      }, options.timeout)
    }
  })
}

export function resolveInput(interactionId: string, value: unknown): void {
  const pending = useSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.complete(value)
}

export function cancelInput(interactionId: string): void {
  const pending = useSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.cancel()
}
