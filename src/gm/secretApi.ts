import { API_BASE } from '../shared/config'
import type { Entity } from '../shared/entityTypes'

function authHeaders(gmToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${gmToken}`,
  }
}

export async function revealEntity(
  roomId: string,
  gmToken: string,
  entityId: string,
): Promise<{ ok: boolean; note?: string }> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/entities/reveal`, {
    method: 'POST',
    headers: authHeaders(gmToken),
    body: JSON.stringify({ entityId }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function hideEntity(
  roomId: string,
  gmToken: string,
  entityId: string,
): Promise<{ ok: boolean; note?: string }> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/entities/hide`, {
    method: 'POST',
    headers: authHeaders(gmToken),
    body: JSON.stringify({ entityId }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createSecretEntity(
  roomId: string,
  gmToken: string,
  entity: Entity,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/secret-entities`, {
    method: 'POST',
    headers: authHeaders(gmToken),
    body: JSON.stringify({ entity }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateSecretEntity(
  roomId: string,
  gmToken: string,
  entityId: string,
  updates: Partial<Entity>,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/secret-entities/${entityId}`, {
    method: 'PATCH',
    headers: authHeaders(gmToken),
    body: JSON.stringify({ updates }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteSecretEntity(
  roomId: string,
  gmToken: string,
  entityId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/secret-entities/${entityId}`, {
    method: 'DELETE',
    headers: authHeaders(gmToken),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
