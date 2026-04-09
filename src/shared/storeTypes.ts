// src/shared/storeTypes.ts — Pure type definitions shared between client stores and server.
// This file MUST NOT import any runtime code (stores, hooks, config) to stay server-tsconfig safe.

import type { Atmosphere, MapToken } from './entityTypes'

// ── Identity types ──

export interface Seat {
  id: string
  name: string
  color: string
  role: 'GM' | 'PL'
  portraitUrl?: string
  activeCharacterId?: string
}

// ── World types ──

export interface Scene {
  id: string
  name: string
  sortOrder: number
  gmOnly: boolean
  atmosphere: Atmosphere
}

export interface RoomState {
  activeSceneId: string | null
  ruleSystemId: string
}

export interface TacticalInfo {
  sceneId: string
  mapUrl: string | null
  mapWidth: number | null
  mapHeight: number | null
  grid: {
    size: number
    snap: boolean
    visible: boolean
    color: string
    offsetX: number
    offsetY: number
  }
  tokens: MapToken[]
  roundNumber: number
  currentTurnTokenId: string | null
  tacticalMode: number
}

export interface AssetRecord {
  id: string
  url: string
  name: string
  mediaType: string
  category: string
  tags: string[]
  sortOrder: number
  createdAt: number
  extra: Record<string, unknown>
}

export interface ArchiveRecord {
  id: string
  sceneId: string
  name: string
  mapUrl: string | null
  mapWidth: number | null
  mapHeight: number | null
  grid: TacticalInfo['grid']
  gmOnly: boolean
  roundNumber: number
  currentTurnTokenId: string | null
}

// ── Admin / Room types ──

/** Shape of a room as used in admin panel listings and socket events. */
export interface RoomMeta {
  id: string
  name: string
  ruleSystemId: string
  createdAt: number
  onlineColors?: string[] // optional: lazily populated via room:presence events
}

/** REST response body for POST /api/rooms */
export interface RoomCreateResponse {
  id: string
  name: string
  ruleSystemId: string
  createdAt: number
  createdBy: string
}
