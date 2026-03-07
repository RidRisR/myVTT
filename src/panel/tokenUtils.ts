export type PinMode = 'always' | 'hover'

/** Parse pinnedProps from shape.meta, with backward compat for old string[] format */
export function readPinModes(raw: unknown): Record<string, PinMode> {
  if (!raw) return {}
  if (Array.isArray(raw)) {
    const m: Record<string, PinMode> = {}
    for (const k of raw as string[]) m[k] = 'always'
    return m
  }
  return raw as Record<string, PinMode>
}
