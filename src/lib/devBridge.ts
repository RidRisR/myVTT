// src/lib/devBridge.ts
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>)['__MYVTT_STORES__'] = {
    world: () => useWorldStore.getState(),
    identity: () => useIdentityStore.getState(),
  }
}
