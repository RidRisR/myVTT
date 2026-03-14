// src/shared/api.ts — HTTP fetch wrapper for REST API
import { API_BASE } from './config'

let apiBase = API_BASE

/** @internal Test-only: override the API base URL */
export function _setApiBase(base: string) {
  apiBase = base
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  // Handle empty responses (204, empty body).
  // Mutation endpoints (POST/PATCH/DELETE) may return 204; GET always returns JSON.
  const contentLength = res.headers.get('content-length')
  if (res.status === 204 || contentLength === '0') {
    return undefined as unknown as T
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
