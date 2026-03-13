import { create } from 'zustand'
import type { AssetMeta } from '../shared/assetTypes'
import { fetchAssets, updateAsset, deleteAsset } from '../shared/assetApi'
import { uploadAsset } from '../shared/assetUpload'

interface AssetStore {
  assets: AssetMeta[]
  loading: boolean
  roomId: string | null

  init: (roomId: string) => Promise<void>
  refresh: () => Promise<void>
  upload: (
    file: File,
    meta: { name?: string; type?: AssetMeta['type']; tags?: string[] },
  ) => Promise<AssetMeta>
  update: (assetId: string, updates: Partial<AssetMeta>) => Promise<void>
  remove: (assetId: string) => Promise<void>

  // Derived data (filters, sorts) should NOT be store methods —
  // they return new references and cause infinite re-renders as selectors.
  // Use useMemo in components instead.
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  assets: [],
  loading: false,
  roomId: null,

  init: async (roomId) => {
    set({ roomId, loading: true })
    try {
      const assets = await fetchAssets(roomId)
      set({ assets, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  refresh: async () => {
    const { roomId } = get()
    if (!roomId) return
    const assets = await fetchAssets(roomId)
    set({ assets })
  },

  upload: async (file, meta) => {
    // Single request: file + metadata sent together via FormData
    const result = await uploadAsset(file, {
      name: meta.name || file.name,
      type: meta.type || 'image',
      extra: { tags: meta.tags || [] },
    })
    const asset: AssetMeta = {
      id: result.id,
      url: result.url,
      name: result.name,
      type: (result.type as AssetMeta['type']) || 'image',
      tags: (result.extra?.tags as string[]) || [],
      createdAt: result.createdAt,
    }
    set((s) => ({ assets: [...s.assets, asset] }))
    return asset
  },

  update: async (assetId, updates) => {
    const { roomId } = get()
    if (!roomId) throw new Error('No room')
    const updated = await updateAsset(roomId, assetId, updates)
    set((s) => ({ assets: s.assets.map((a) => (a.id === assetId ? updated : a)) }))
  },

  remove: async (assetId) => {
    const { roomId } = get()
    if (!roomId) throw new Error('No room')
    await deleteAsset(roomId, assetId)
    set((s) => ({ assets: s.assets.filter((a) => a.id !== assetId) }))
  },
}))
