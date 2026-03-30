// server/logUtils.ts — Shared utilities for game_log entry conversion
import type { GameLogEntry } from '../src/shared/logTypes'

/** Convert a raw DB row to a typed GameLogEntry */
export function rowToEntry(row: Record<string, unknown>): GameLogEntry {
  return {
    seq: row.seq as number,
    id: row.id as string,
    type: row.type as string,
    origin: JSON.parse(row.origin as string) as GameLogEntry['origin'],
    executor: row.executor as string,
    parentId: (row.parent_id as string | null) ?? undefined,
    groupId: (row.group_id ?? '') as string,
    chainDepth: row.chain_depth as number,
    triggerable: !!(row.triggerable as number),
    visibility: JSON.parse(row.visibility as string) as GameLogEntry['visibility'],
    baseSeq: row.base_seq as number,
    payload: JSON.parse(row.payload as string) as Record<string, unknown>,
    timestamp: row.timestamp as number,
  }
}
