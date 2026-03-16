import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
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
      expect(state.assets).toHaveLength(2)
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

      expect(useAssetStore.getState().assets).toHaveLength(1)
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
      expect(remaining[0]?.id).toBe('a2')
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

      expect(useAssetStore.getState().assets[0]?.name).toBe('new.png')
    })
  })

  describe('normalizer', () => {
    it('extracts tags from extra into top-level field', async () => {
      const serverResponse = [
        {
          id: 'a1',
          url: '/test.png',
          name: 'test',
          type: 'image',
          createdAt: 1000,
          extra: { tags: ['map', 'outdoor'] },
        },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(serverResponse),
      })

      await useAssetStore.getState().init('room-norm')

      const asset = useAssetStore.getState().assets[0]
      expect(asset).toBeDefined()
      expect(asset?.tags).toEqual(['map', 'outdoor'])
    })

    it('extracts blueprint metadata from extra', async () => {
      const serverResponse = [
        {
          id: 'bp-1',
          url: '/goblin.png',
          name: 'Goblin',
          type: 'blueprint',
          createdAt: 2000,
          extra: {
            tags: [],
            blueprint: { defaultSize: 2, defaultColor: '#ff0000' },
          },
        },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(serverResponse),
      })

      await useAssetStore.getState().init('room-bp')

      const asset = useAssetStore.getState().assets[0]
      expect(asset).toBeDefined()
      expect(asset?.type).toBe('blueprint')
      expect(asset?.blueprint).toEqual({
        defaultSize: 2,
        defaultColor: '#ff0000',
      })
    })

    it('handles assets without extra gracefully', async () => {
      const serverResponse = [
        {
          id: 'a-bare',
          url: '/bare.png',
          name: 'bare',
          type: 'image',
          createdAt: 3000,
        },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(serverResponse),
      })

      await useAssetStore.getState().init('room-bare')

      const asset = useAssetStore.getState().assets[0]
      expect(asset).toBeDefined()
      expect(asset?.tags).toEqual([])
      expect(asset?.blueprint).toBeUndefined()
    })
  })

  describe('softRemove', () => {
    it('immediately removes asset from UI', () => {
      useAssetStore.setState({
        roomId: 'room-1',
        assets: [makeAsset({ id: 'a1' }), makeAsset({ id: 'a2' })],
      })

      useAssetStore.getState().softRemove('a1')

      expect(useAssetStore.getState().assets).toHaveLength(1)
      expect(useAssetStore.getState().assets[0]?.id).toBe('a2')
    })

    it('undo restores asset to list and cancels server delete', () => {
      vi.useFakeTimers()
      useAssetStore.setState({
        roomId: 'room-1',
        assets: [makeAsset({ id: 'a1' })],
      })

      const undo = useAssetStore.getState().softRemove('a1', 1000)
      expect(useAssetStore.getState().assets).toHaveLength(0)

      undo()
      expect(useAssetStore.getState().assets).toHaveLength(1)
      expect(useAssetStore.getState().assets[0]?.id).toBe('a1')

      // Advance past the delay — deleteAsset should NOT be called
      mockFetch.mockClear()
      vi.advanceTimersByTime(2000)
      expect(mockFetch).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('calls deleteAsset after delay when undo is not called', () => {
      vi.useFakeTimers()
      useAssetStore.setState({
        roomId: 'room-1',
        assets: [makeAsset({ id: 'a1' })],
      })
      mockFetch.mockResolvedValue({ ok: true })

      useAssetStore.getState().softRemove('a1', 500)

      // Not yet called
      expect(mockFetch).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)

      // Now deleteAsset should have been called
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const url = mockFetch.mock.calls[0]?.[0] as string
      expect(url).toContain('/assets/a1')

      vi.useRealTimers()
    })

    it('returns noop when asset does not exist', () => {
      useAssetStore.setState({ roomId: 'room-1', assets: [] })

      const undo = useAssetStore.getState().softRemove('nonexistent')

      // Should be a function that does nothing
      expect(typeof undo).toBe('function')
      undo() // should not throw
      expect(useAssetStore.getState().assets).toHaveLength(0)
    })
  })

  describe('upload with blueprint type', () => {
    it('sends blueprint metadata in extra and stores normalized result', async () => {
      useAssetStore.setState({ roomId: 'room-1', assets: [] })
      // uploadAsset reads roomId from window.location.hash
      window.location.hash = '#room=room-1'

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'bp-new',
            url: '/goblin.png',
            name: 'Goblin',
            type: 'blueprint',
            createdAt: 5000,
            extra: {
              tags: [],
              blueprint: { defaultSize: 1, defaultColor: '#3b82f6' },
            },
          }),
      })

      const fakeFile = new File(['pixel'], 'goblin.png', { type: 'image/png' })
      const result = await useAssetStore.getState().upload(fakeFile, {
        name: 'Goblin',
        type: 'blueprint',
        blueprint: { defaultSize: 1, defaultColor: '#3b82f6' },
      })

      expect(result.type).toBe('blueprint')
      expect(result.blueprint).toEqual({ defaultSize: 1, defaultColor: '#3b82f6' })
      expect(result.url).toBe('/goblin.png')

      const assets = useAssetStore.getState().assets
      expect(assets).toHaveLength(1)
      expect(assets[0]?.type).toBe('blueprint')
    })
  })
})
