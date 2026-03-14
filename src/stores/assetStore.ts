import { create } from 'zustand'
import type { AssetMeta } from '../shared/assetTypes'
import { fetchAssets, updateAsset, deleteAsset } from '../shared/assetApi'
import { uploadAsset } from '../shared/assetUpload'

/** Normalize raw server response (extra.tags/blueprint/handout) into flat AssetMeta */
function normalizeAsset(raw: Record<string, unknown>): AssetMeta {
  const extra = (raw.extra as Record<string, unknown>) || {}
  return {
    id: raw.id as string,
    url: raw.url as string,
    name: raw.name as string,
    type: (raw.type as AssetMeta['type']) || 'image',
    tags: (extra.tags as string[]) || (raw.tags as string[]) || [],
    createdAt: raw.createdAt as number,
    ...(extra.blueprint ? { blueprint: extra.blueprint as AssetMeta['blueprint'] } : {}),
    ...(extra.handout ? { handout: extra.handout as AssetMeta['handout'] } : {}),
  }
}

interface AssetStore {
  assets: AssetMeta[]
  loading: boolean
  roomId: string | null

  init: (roomId: string) => Promise<void>
  refresh: () => Promise<void>
  upload: (
    file: File,
    meta: {
      name?: string
      type?: AssetMeta['type']
      tags?: string[]
      blueprint?: AssetMeta['blueprint']
    },
  ) => Promise<AssetMeta>
  update: (assetId: string, updates: Partial<AssetMeta>) => Promise<void>
  remove: (assetId: string) => Promise<void>

  // Derived data (filters, sorts) should NOT be store methods —
  // they return new references and cause infinite re-renders as selectors.
  // Use useMemo in components instead.

  /** @internal Test-only */
  _reset: () => void
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  assets: [],
  loading: false,
  roomId: null,

  init: async (roomId) => {
    set({ roomId, loading: true })
    try {
      const raw = await fetchAssets(roomId)
      const assets = (raw as unknown as Record<string, unknown>[]).map(normalizeAsset)
      set({ assets, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  refresh: async () => {
    const { roomId } = get()
    if (!roomId) return
    const raw = await fetchAssets(roomId)
    const assets = (raw as unknown as Record<string, unknown>[]).map(normalizeAsset)
    set({ assets })
  },

  upload: async (file, meta) => {
    const extra: Record<string, unknown> = { tags: meta.tags || [] }
    if (meta.blueprint) extra.blueprint = meta.blueprint

    const result = await uploadAsset(file, {
      name: meta.name || file.name,
      type: meta.type || 'image',
      extra,
    })
    const asset = normalizeAsset(result as unknown as Record<string, unknown>)
    set((s) => ({ assets: [...s.assets, asset] }))
    return asset
  },

  update: async (assetId, updates) => {
    const { roomId } = get()
    if (!roomId) throw new Error('No room')
    const updated = await updateAsset(roomId, assetId, updates)
    const normalized = normalizeAsset(updated as unknown as Record<string, unknown>)
    set((s) => ({ assets: s.assets.map((a) => (a.id === assetId ? normalized : a)) }))
  },

  remove: async (assetId) => {
    const { roomId } = get()
    if (!roomId) throw new Error('No room')
    await deleteAsset(roomId, assetId)
    set((s) => ({ assets: s.assets.filter((a) => a.id !== assetId) }))
  },

  /** @internal Test-only: reset store to initial state */
  _reset: () => set({ assets: [], loading: false, roomId: null }),
}))
