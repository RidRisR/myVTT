// src/lib/devBridge.ts
import { useWorldStore } from '../stores/worldStore'
import { useAssetStore } from '../stores/assetStore'

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>)['__MYVTT_STORES__'] = {
    world: () => useWorldStore.getState(),
    asset: () => useAssetStore.getState(),
  }
}
