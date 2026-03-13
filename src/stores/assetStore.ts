import { create } from 'zustand'
import type { AssetMeta } from '../shared/assetTypes'
import {
  fetchAssets,
  createAssetMeta,
  updateAsset,
  deleteAsset,
  getCurrentRoomId,
} from '../shared/assetApi'
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

  imageAssets: () => AssetMeta[]
  blueprintAssets: () => AssetMeta[]
  handoutAssets: () => AssetMeta[]
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
    const roomId = get().roomId || getCurrentRoomId()
    // Upload the file first
    const url = await uploadAsset(file)
    // Then create the metadata entry
    const assetMeta: Omit<AssetMeta, 'id' | 'createdAt'> = {
      url,
      name: meta.name || file.name,
      type: meta.type || 'image',
      tags: meta.tags || [],
    }
    const asset = await createAssetMeta(roomId, assetMeta)
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

  imageAssets: () => get().assets.filter((a) => a.type === 'image'),
  blueprintAssets: () => get().assets.filter((a) => a.type === 'blueprint'),
  handoutAssets: () => get().assets.filter((a) => a.type === 'handout'),
}))
