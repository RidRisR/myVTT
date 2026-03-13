// server/deepMerge.ts — Recursive deep merge for PATCH operations on JSON fields

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

/**
 * Deep merge source into target. Arrays are overwritten (not merged).
 * Returns a new object — does not mutate inputs.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T | null | undefined,
  source: Record<string, unknown>,
): T {
  if (!isPlainObject(target)) return { ...source } as T
  const result: Record<string, unknown> = { ...target }
  for (const [key, val] of Object.entries(source)) {
    if (isPlainObject(val) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, val)
    } else {
      result[key] = val
    }
  }
  return result as T
}
