import { useSyncExternalStore } from 'react'

type Role = 'GM' | 'PL'

let _role: Role = 'PL'
const roleListeners = new Set<() => void>()

export const roleStore = {
  get: () => _role,
  set: (role: Role) => {
    _role = role
    roleListeners.forEach((l) => l())
  },
  subscribe: (listener: () => void) => {
    roleListeners.add(listener)
    return () => { roleListeners.delete(listener) }
  },
}

export function useRole(): Role {
  return useSyncExternalStore(roleStore.subscribe, roleStore.get)
}

let _popoverOpen = false
const popoverListeners = new Set<() => void>()

export const popoverStore = {
  get: () => _popoverOpen,
  set: (open: boolean) => {
    _popoverOpen = open
    popoverListeners.forEach((l) => l())
  },
  subscribe: (listener: () => void) => {
    popoverListeners.add(listener)
    return () => { popoverListeners.delete(listener) }
  },
}

export function usePopoverOpen(): boolean {
  return useSyncExternalStore(popoverStore.subscribe, popoverStore.get)
}
