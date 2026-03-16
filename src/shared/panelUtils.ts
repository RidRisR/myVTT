/**
 * Adjust a numeric or HP-format value by delta.
 * "15/20" + delta=-1 → "14/20" (clamped to [0, max])
 * "7" + delta=+1 → "8" (clamped to >= 0)
 */
export function adjustNumericValue(value: string, delta: number): string {
  const hpMatch = value.match(/^(\d+)\/(\d+)$/)
  if (hpMatch) {
    const cur = parseInt(hpMatch[1] ?? '0')
    const max = parseInt(hpMatch[2] ?? '0')
    return `${Math.max(0, Math.min(cur + delta, max))}/${max}`
  }
  return `${Math.max(0, parseInt(value) + delta)}`
}
