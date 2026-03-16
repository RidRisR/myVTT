// server/deepMerge.ts — Recursive deep merge for PATCH operations on JSON fields

function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) return false
  const proto = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
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
  const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
  for (const [key, val] of Object.entries(source)) {
    if (DANGEROUS_KEYS.has(key)) continue
    if (isPlainObject(val) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], val)
    } else {
      result[key] = val
    }
  }
  return result as T
}
