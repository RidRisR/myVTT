// server/socketTypes.ts — Typed Socket.io generics for the myVTT server
import type {
  Server as SocketIOServer,
  Socket as SocketIOSocket,
  DefaultEventsMap,
} from 'socket.io'

/** Shape of data attached to each socket after auth middleware runs */
export interface SocketData {
  roomId: string
  seatId: string | null
  role: 'GM' | 'PL' | null
}

/** Typed Socket.io Server — SocketData is the 4th generic param */
export type TypedServer = SocketIOServer<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>

/** Typed individual socket */
export type TypedSocket = SocketIOSocket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>
