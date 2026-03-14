import { describe, it, expect, beforeEach, vi } from 'vitest'
import { api } from '../api'

function mockResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const { status = 200, headers = {} } = init
  const headersObj = new Headers(headers)
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 500 ? 'Internal Server Error' : 'OK',
    headers: headersObj,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('api', () => {
  it('GET 200 returns parsed JSON data', async () => {
    const data = { id: '1', name: 'test' }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(data))

    const result = await api.get('/items/1')

    expect(result).toEqual(data)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/items/1'),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('POST 201 returns created entity with correct Content-Type and body', async () => {
    const created = { id: '2', name: 'new item' }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(created, { status: 201 }))

    const payload = { name: 'new item' }
    const result = await api.post('/items', payload)

    expect(result).toEqual(created)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/items'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )
  })

  it('PATCH 200 returns result', async () => {
    const updated = { id: '1', name: 'updated' }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(updated))

    const result = await api.patch('/items/1', { name: 'updated' })

    expect(result).toEqual(updated)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/items/1'),
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('DELETE 200 returns result', async () => {
    const deleted = { ok: true }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(deleted))

    const result = await api.delete('/items/1')

    expect(result).toEqual(deleted)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/items/1'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('500 response throws Error with error message from body', async () => {
    const errorBody = { error: 'Something went wrong' }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(errorBody, { status: 500 }))

    await expect(api.get('/fail')).rejects.toThrow('Something went wrong')
  })

  it('network error throws Error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(api.get('/unreachable')).rejects.toThrow('Failed to fetch')
  })

  it('204 No Content returns undefined', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(null, { status: 204 }))

    const result = await api.delete('/items/1')

    expect(result).toBeUndefined()
  })

  it('always sends credentials: include', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true }))

    await api.get('/anything')

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('404 response throws Error with error message from body', async () => {
    const errorBody = { error: 'Not found' }
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(errorBody, { status: 404 }))

    await expect(api.get('/missing')).rejects.toThrow('Not found')
  })

  it('error response with no error field falls back to statusText', async () => {
    const errorBody = { message: 'some other format' }
    const res = mockResponse(errorBody, { status: 500 })
    vi.mocked(fetch).mockResolvedValueOnce(res)

    await expect(api.get('/fail')).rejects.toThrow('Internal Server Error')
  })

  it('error response with non-JSON body falls back to statusText', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: new Headers(),
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    } as unknown as Response)

    await expect(api.get('/fail')).rejects.toThrow('Bad Gateway')
  })

  it('POST without body does not send Content-Type header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true }, { status: 200 }))

    await api.post('/action')

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        headers: undefined,
        body: undefined,
      }),
    )
  })

  it('content-length 0 returns undefined', async () => {
    const res = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-length': '0' }),
      json: vi.fn(),
    } as unknown as Response
    vi.mocked(fetch).mockResolvedValueOnce(res)

    const result = await api.get('/empty')

    expect(result).toBeUndefined()
    expect(res.json).not.toHaveBeenCalled()
  })
})
