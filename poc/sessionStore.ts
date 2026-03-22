import { create } from 'zustand'

interface SessionState {
  selection: string[]
}

export const usePocSessionStore = create<SessionState>(() => ({
  selection: [],
}))

// Write function — only for core:set-selection workflow step
export function _setSelection(entityIds: string[]) {
  usePocSessionStore.setState({ selection: entityIds })
}
