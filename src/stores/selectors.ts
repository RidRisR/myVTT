// src/stores/selectors.ts
// Reusable selectors for derived data from stores.
// Components use these with useWorldStore(selector) for fine-grained subscriptions.

import type { Entity, MapToken } from '../shared/entityTypes'
import type { Scene, RoomState, CombatInfo } from './worldStore'
import type { Seat } from './identityStore'
import { getEntityResources, getEntityAttributes } from '../shared/entityAdapters'

// ── World store selectors ──

export const selectRoom = (s: { room: RoomState }) => s.room
export const selectActiveSceneId = (s: { room: RoomState }) => s.room.activeSceneId
export const selectScenes = (s: { scenes: Scene[] }) => s.scenes
export const selectEntities = (s: { entities: Record<string, Entity> }) => s.entities
export const selectTokens = (s: { combatInfo: CombatInfo | null }): Record<string, MapToken> =>
  s.combatInfo?.tokens ?? {}
export const selectCombatInfo = (s: { combatInfo: CombatInfo | null }) => s.combatInfo

export const selectActiveScene = (s: { room: RoomState; scenes: Scene[] }): Scene | null => {
  const id = s.room.activeSceneId
  if (!id) return null
  return s.scenes.find((sc) => sc.id === id) ?? null
}

export const selectIsCombat = (s: { room: RoomState }): boolean => {
  return s.room.activeEncounterId != null
}

// ── Entity lookups ──

export function selectEntityById(id: string | null) {
  return (s: { entities: Record<string, Entity> }): Entity | null => {
    if (!id) return null
    return s.entities[id] ?? null
  }
}

export function selectTokenById(id: string | null) {
  return (s: { combatInfo: CombatInfo | null }): MapToken | null => {
    if (!id) return null
    return s.combatInfo?.tokens[id] ?? null
  }
}

// ── Derived chat properties ──

export function deriveSeatProperties(
  activeEntity: Entity | null,
  selectedTokenEntity: Entity | null,
): { key: string; value: string }[] {
  const allProps = [
    ...getEntityResources(activeEntity)
      .filter((r) => r.key)
      .map((r) => ({ key: r.key, value: String(r.current) })),
    ...getEntityAttributes(activeEntity)
      .filter((a) => a.key)
      .map((a) => ({ key: a.key, value: String(a.value) })),
    ...getEntityResources(selectedTokenEntity)
      .filter((r) => r.key)
      .map((r) => ({ key: r.key, value: String(r.current) })),
    ...getEntityAttributes(selectedTokenEntity)
      .filter((a) => a.key)
      .map((a) => ({ key: a.key, value: String(a.value) })),
  ]
  return [...new Map(allProps.map((p) => [p.key, p])).values()]
}

// ── Speaker entities (for chat) ──

export function selectSpeakerEntities(
  entities: Record<string, Entity>,
  mySeatId: string | null,
  isGM: boolean,
): Entity[] {
  const arr = Object.values(entities)
  if (isGM) return arr
  if (!mySeatId) return []
  return arr.filter((e) => e.permissions.seats[mySeatId] === 'owner')
}

// ── Identity selectors ──

export const selectSeats = (s: { seats: Seat[] }) => s.seats
export const selectMySeatId = (s: { mySeatId: string | null }) => s.mySeatId
export const selectOnlineSeatIds = (s: { onlineSeatIds: Set<string> }) => s.onlineSeatIds
