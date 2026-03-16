// src/shared/socketEvents.ts — Typed Socket.io event contracts
// Both server and client import from this file to ensure event name + payload consistency.
// Adding a new socket event? Define it here first. This prevents "dangling listener" bugs
// where one side registers an event the other side never emits.

import type { Seat } from '../stores/identityStore'
import type {
  Scene,
  RoomState,
  TacticalInfo,
  TeamTracker,
  AssetRecord,
  ArchiveRecord,
} from '../stores/worldStore'
import type { Entity, MapToken } from './entityTypes'
import type { ChatMessage } from '../chat/chatTypes'
import type { ShowcaseItem } from '../showcase/showcaseTypes'

/** Events the server emits → client listens for */
export interface ServerToClientEvents {
  // ── Seats ──
  'seat:created': (seat: Seat) => void
  'seat:updated': (seat: Seat) => void
  'seat:deleted': (data: { id: string }) => void
  'seat:online': (data: { seatId: string }) => void
  'seat:offline': (data: { seatId: string }) => void

  // ── Scenes ──
  'scene:created': (scene: Scene) => void
  'scene:updated': (scene: Scene) => void
  'scene:deleted': (data: { id: string }) => void
  'scene:entity:linked': (data: { sceneId: string; entityId: string; visible?: boolean }) => void
  'scene:entity:unlinked': (data: { sceneId: string; entityId: string }) => void
  'scene:entity:updated': (data: { sceneId: string; entityId: string; visible: boolean }) => void

  // ── Entities ──
  'entity:created': (entity: Entity) => void
  'entity:updated': (entity: Entity) => void
  'entity:deleted': (data: { id: string }) => void

  // ── Tactical ──
  'tactical:updated': (state: TacticalInfo) => void
  'tactical:token:added': (token: MapToken) => void
  'tactical:token:updated': (token: MapToken) => void
  'tactical:token:removed': (data: { id: string }) => void

  // ── Chat ──
  'chat:new': (message: ChatMessage) => void
  'chat:retracted': (data: { id: string }) => void

  // ── Room state ──
  'room:state:updated': (state: Partial<RoomState>) => void

  // ── Trackers ──
  'tracker:created': (tracker: TeamTracker) => void
  'tracker:updated': (tracker: TeamTracker) => void
  'tracker:deleted': (data: { id: string }) => void

  // ── Showcase ──
  'showcase:created': (item: ShowcaseItem) => void
  'showcase:updated': (item: ShowcaseItem) => void
  'showcase:deleted': (data: { id: string }) => void
  'showcase:pinned': (data: { id: string }) => void
  'showcase:unpinned': (data: Record<string, never>) => void
  'showcase:cleared': (data: Record<string, never>) => void

  // ── Assets ──
  'asset:created': (asset: AssetRecord) => void
  'asset:updated': (asset: AssetRecord) => void
  'asset:deleted': (data: { id: string }) => void

  // ── Archives ──
  'archive:created': (archive: ArchiveRecord) => void
  'archive:updated': (archive: ArchiveRecord) => void
  'archive:deleted': (data: { id: string }) => void

  // ── Awareness (server injects seatId/clientId before relay) ──
  'awareness:update': (data: {
    field: string
    state: unknown
    seatId: string
    clientId: string
  }) => void
  'awareness:editing': (data: {
    entityId: string
    field: string
    value: number
    seatId: string
    color: string
  }) => void
  'awareness:clear': (data: { seatId: string }) => void
  'awareness:tokenDrag': (data: {
    tokenId: string
    x: number
    y: number
    color: string
    seatId: string
  }) => void
  'awareness:tokenDragEnd': (data: { seatId: string }) => void
  'awareness:remove': (data: { seatId: string; clientId: string }) => void
}

/** Events the client emits → server listens for */
export interface ClientToServerEvents {
  // ── Seat auth ──
  'auth:update': (data: { seatId: string }) => void
  'seat:claim': (data: { seatId: string }) => void
  'seat:leave': (data: { seatId: string }) => void

  // ── Awareness (raw from client, server will inject seatId) ──
  'awareness:update': (data: { field: string; state: unknown }) => void
  'awareness:editing': (data: {
    entityId: string
    field: string
    value: number
    seatId: string
    color: string
  }) => void
  'awareness:clear': (data: { seatId: string }) => void
  'awareness:tokenDrag': (data: {
    tokenId: string
    x: number
    y: number
    color: string
    seatId: string
  }) => void
  'awareness:tokenDragEnd': (data: { seatId: string }) => void
}
