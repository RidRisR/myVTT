import { API_BASE } from './config'
import type { AssetMeta } from './assetTypes'

export function getCurrentRoomId(): string {
  const hash = window.location.hash
  const match = hash.match(/^#room=([a-zA-Z0-9_-]+)/)
  if (!match) throw new Error('No roomId found in URL hash')
  return match[1]
}

export async function fetchAssets(roomId: string): Promise<AssetMeta[]> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/assets`)
  if (!res.ok) throw new Error(`fetchAssets failed: ${res.status}`)
  return res.json()
}

export async function createAssetMeta(
  roomId: string,
  meta: Omit<AssetMeta, 'id' | 'createdAt'>,
): Promise<AssetMeta> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  })
  if (!res.ok) throw new Error(`createAssetMeta failed: ${res.status}`)
  return res.json()
}

export async function updateAsset(
  roomId: string,
  assetId: string,
  updates: Partial<AssetMeta>,
): Promise<AssetMeta> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/assets/${assetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`updateAsset failed: ${res.status}`)
  return res.json()
}

export async function deleteAsset(roomId: string, assetId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/assets/${assetId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`deleteAsset failed: ${res.status}`)
}
