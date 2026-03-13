import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAssetStore } from '../assetStore'
import type { AssetMeta } from '../../shared/assetTypes'

function makeAsset(overrides?: Partial<AssetMeta>): AssetMeta {
  return {
    id: 'asset-1',
    url: '/api/rooms/room1/assets/test.png',
    name: 'test.png',
    type: 'image',
    tags: [],
    createdAt: Date.now(),
    ...overrides,
  }
}

// Mock fetch globally
const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  // Reset zustand store between tests
  useAssetStore.setState({
    assets: [],
    loading: false,
    roomId: null,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('assetStore', () => {
  describe('init', () => {
    it('loads assets from server and sets roomId', async () => {
      const assets = [makeAsset({ id: 'a1' }), makeAsset({ id: 'a2', type: 'handout' })]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(assets),
      })

      await useAssetStore.getState().init('room-42')

      const state = useAssetStore.getState()
      expect(state.roomId).toBe('room-42')
      expect(state.assets).toEqual(assets)
      expect(state.loading).toBe(false)
    })

    it('sets loading=false on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await useAssetStore.getState().init('room-err')

      const state = useAssetStore.getState()
      expect(state.loading).toBe(false)
      expect(state.assets).toEqual([])
    })
  })

  describe('refresh', () => {
    it('re-fetches assets for current roomId', async () => {
      useAssetStore.setState({ roomId: 'room-1', assets: [] })
      const newAssets = [makeAsset({ id: 'refreshed' })]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(newAssets),
      })

      await useAssetStore.getState().refresh()

      expect(useAssetStore.getState().assets).toEqual(newAssets)
    })

    it('does nothing without roomId', async () => {
      useAssetStore.setState({ roomId: null, assets: [], loading: false })
      mockFetch.mockClear()

      await useAssetStore.getState().refresh()

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('removes asset from local state after server delete', async () => {
      useAssetStore.setState({
        roomId: 'room-1',
        assets: [makeAsset({ id: 'a1' }), makeAsset({ id: 'a2' })],
      })
      mockFetch.mockResolvedValueOnce({ ok: true })

      await useAssetStore.getState().remove('a1')

      const remaining = useAssetStore.getState().assets
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe('a2')
    })
  })

  describe('update', () => {
    it('updates asset in local state after server patch', async () => {
      const original = makeAsset({ id: 'a1', name: 'old.png' })
      useAssetStore.setState({ roomId: 'room-1', assets: [original] })
      const updated = { ...original, name: 'new.png' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updated),
      })

      await useAssetStore.getState().update('a1', { name: 'new.png' })

      expect(useAssetStore.getState().assets[0].name).toBe('new.png')
    })
  })

  describe('imageAssets / blueprintAssets / handoutAssets', () => {
    it('filters assets by type', () => {
      useAssetStore.setState({
        assets: [
          makeAsset({ id: 'img1', type: 'image' }),
          makeAsset({ id: 'bp1', type: 'blueprint' }),
          makeAsset({ id: 'h1', type: 'handout' }),
          makeAsset({ id: 'img2', type: 'image' }),
        ],
      })

      const state = useAssetStore.getState()
      expect(state.imageAssets()).toHaveLength(2)
      expect(state.blueprintAssets()).toHaveLength(1)
      expect(state.handoutAssets()).toHaveLength(1)
    })
  })
})
