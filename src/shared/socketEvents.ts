// src/shared/socketEvents.ts — Typed Socket.io event contracts
// Both server and client import from this file to ensure event name + payload consistency.
// Adding a new socket event? Define it here first. This prevents "dangling listener" bugs
// where one side registers an event the other side never emits.

import type { Socket } from 'socket.io-client'
import type {
  Seat,
  Scene,
  RoomState,
  TacticalInfo,
  AssetRecord,
  ArchiveRecord,
  RoomMeta,
} from './storeTypes'
import type { Entity, MapToken, Blueprint } from './entityTypes'
import type {
  GameLogEntry,
  LogEntrySubmission,
  RollRequest,
  LogEntryAck,
  RollRequestAck,
} from './logTypes'
import type { ShowcaseItem } from './showcaseTypes'
import type { TagMeta } from './assetTypes'

/** Typed client socket — enforces event name + payload consistency */
export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

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

  // ── Game Log ──
  'log:new': (entry: GameLogEntry) => void

  // ── Room state ──
  'room:state:updated': (state: Partial<RoomState>) => void

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
  'asset:reordered': (assets: AssetRecord[]) => void

  // ── Tags ──
  'tag:created': (tag: TagMeta) => void
  'tag:updated': (tag: TagMeta) => void
  'tag:deleted': (data: { id: string }) => void

  // ── Blueprints ──
  'blueprint:created': (blueprint: Blueprint) => void
  'blueprint:updated': (blueprint: Blueprint) => void
  'blueprint:deleted': (data: { id: string }) => void

  // ── Archives ──
  'archive:created': (archive: ArchiveRecord) => void
  'archive:updated': (archive: ArchiveRecord) => void
  'archive:deleted': (data: { id: string }) => void

  // ── Admin presence (server → admin room only) ──
  'admin:snapshot': (rooms: RoomMeta[]) => void
  'room:presence': (data: { roomId: string; onlineColors: string[] }) => void
  'room:created': (room: Omit<RoomMeta, 'onlineColors'>) => void
  'room:deleted': (data: { id: string }) => void

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

  // ── Layout sync ──
  'layout:updated': (layout: {
    narrative: Record<string, unknown>
    tactical: Record<string, unknown>
  }) => void

  // ── Awareness channel (generic) ──
  'awareness:ch:broadcast': (data: { channel: string; payload: unknown; seatId: string }) => void
  'awareness:ch:clear': (data: { channel: string; seatId: string }) => void
}

/** Events the client emits → server listens for */
export interface ClientToServerEvents {
  // ── Seat auth ──
  'auth:update': (data: { seatId: string }) => void
  'seat:claim': (data: { seatId: string }) => void
  'seat:leave': (data: { seatId: string }) => void

  // ── Admin ──
  'join:admin': () => void

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

  // ── Game Log ──
  'log:entry': (entry: LogEntrySubmission, ack: (response: LogEntryAck) => void) => void
  'log:roll-request': (request: RollRequest, ack: (response: RollRequestAck) => void) => void
  'log:history': (
    query: { beforeSeq?: number; limit?: number },
    ack: (entries: GameLogEntry[]) => void,
  ) => void

  // ── Entity management (workflow-driven) ──
  'entity:create-request': (
    data: {
      id: string
      components?: Record<string, unknown>
      lifecycle?: import('./entityTypes').EntityLifecycle
      tags?: string[]
    },
    ack: (response: import('./entityTypes').Entity | { error: string }) => void,
  ) => void
  'entity:delete-request': (
    data: { id: string },
    ack: (response: { ok: true } | { error: string }) => void,
  ) => void

  // ── Awareness channel (generic) ──
  'awareness:ch:broadcast': (data: { channel: string; payload: unknown }) => void
  'awareness:ch:clear': (data: { channel: string }) => void
}
