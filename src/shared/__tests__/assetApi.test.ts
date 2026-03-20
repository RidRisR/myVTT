import { getCurrentRoomId, fetchAssets, updateAsset, deleteAsset, reorderAssets } from '../assetApi'

// Mock config module to provide a stable API_BASE
vi.mock('../config', () => ({ API_BASE: 'http://test' }))

// --- getCurrentRoomId ---

describe('getCurrentRoomId', () => {
  const original = window.location

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { ...original, hash: '' },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: original, writable: true })
  })

  it('parses roomId from hash', () => {
    window.location.hash = '#room=abc123'
    expect(getCurrentRoomId()).toBe('abc123')
  })

  it('parses roomId with hyphens and underscores', () => {
    window.location.hash = '#room=my_room-1'
    expect(getCurrentRoomId()).toBe('my_room-1')
  })

  it('throws when no room hash', () => {
    window.location.hash = '#other=foo'
    expect(() => getCurrentRoomId()).toThrow('No roomId found in URL hash')
  })

  it('throws for empty hash', () => {
    window.location.hash = ''
    expect(() => getCurrentRoomId()).toThrow()
  })
})

// --- REST API functions ---

describe('fetchAssets', () => {
  it('calls GET with correct URL and credentials', async () => {
    const mockData = [{ id: '1', name: 'test' }]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) }),
    )

    const result = await fetchAssets('room1')
    expect(fetch).toHaveBeenCalledWith('http://test/api/rooms/room1/assets', {
      credentials: 'include',
    })
    expect(result).toEqual(mockData)
    vi.unstubAllGlobals()
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(fetchAssets('room1')).rejects.toThrow('fetchAssets failed: 500')
    vi.unstubAllGlobals()
  })
})

describe('updateAsset', () => {
  it('calls PATCH with correct URL, body, and headers', async () => {
    const mockData = { id: '1', name: 'updated' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) }),
    )

    const result = await updateAsset('room1', 'asset1', { name: 'updated' })
    expect(fetch).toHaveBeenCalledWith('http://test/api/rooms/room1/assets/asset1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'updated' }),
      credentials: 'include',
    })
    expect(result).toEqual(mockData)
    vi.unstubAllGlobals()
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    await expect(updateAsset('room1', 'a1', {})).rejects.toThrow('updateAsset failed: 403')
    vi.unstubAllGlobals()
  })
})

describe('deleteAsset', () => {
  it('calls DELETE with correct URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    await deleteAsset('room1', 'asset1')
    expect(fetch).toHaveBeenCalledWith('http://test/api/rooms/room1/assets/asset1', {
      method: 'DELETE',
      credentials: 'include',
    })
    vi.unstubAllGlobals()
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(deleteAsset('room1', 'a1')).rejects.toThrow('deleteAsset failed: 404')
    vi.unstubAllGlobals()
  })
})

describe('reorderAssets', () => {
  it('calls PATCH /reorder with getCurrentRoomId', async () => {
    // Set up room hash
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hash: '#room=myRoom' },
      writable: true,
    })
    const mockData = [{ id: '1' }]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) }),
    )

    const order = [{ id: '1', sortOrder: 1000 }]
    const result = await reorderAssets(order)
    expect(fetch).toHaveBeenCalledWith('http://test/api/rooms/myRoom/assets/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ order }),
    })
    expect(result).toEqual(mockData)
    vi.unstubAllGlobals()
  })

  it('throws on non-ok response', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hash: '#room=r1' },
      writable: true,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, statusText: 'Internal Server Error' }),
    )
    await expect(reorderAssets([])).rejects.toThrow('Reorder failed: Internal Server Error')
    vi.unstubAllGlobals()
  })
})
