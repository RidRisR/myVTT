// server/socketTypes.ts — Typed Socket.io generics for the myVTT server
import type {
  Server as SocketIOServer,
  Socket as SocketIOSocket,
  DefaultEventsMap,
} from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '../src/shared/socketEvents'

/** Shape of data attached to each socket after auth middleware runs */
export interface SocketData {
  roomId: string
  seatId: string | null
  role: 'GM' | 'PL' | null
}

/** Typed Socket.io Server — event maps enforce emit/listen consistency */
export type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>

/** Typed individual socket */
export type TypedSocket = SocketIOSocket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>
