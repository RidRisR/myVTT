// server/visibility.ts
import type { Visibility } from '../src/shared/logTypes'

export function shouldReceive(
  visibility: Visibility,
  seatId: string | null,
  role: string | null,
): boolean {
  if (Object.keys(visibility).length === 0) return true
  if ('include' in visibility) {
    const list = visibility.include
    if (seatId && list.includes(seatId)) return true
    if (role === 'GM' && list.includes('gm')) return true
    return false
  }
  // exclude filters by seatId only — no special GM role handling (asymmetric with include by design:
  // include uses 'gm' as a role alias so GM can always see whispered content,
  // but exclude has no use case for excluding a role rather than a specific seat)
  if ('exclude' in visibility) {
    return !seatId || !visibility.exclude.includes(seatId)
  }
  return true
}
