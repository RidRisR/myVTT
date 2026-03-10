import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const Y = require('yjs')

/**
 * Recursively deep-copy all entries from source Y.Map into target Y.Map.
 * Handles nested Y.Map and Y.Array structures.
 * MUST be called inside a doc.transact() block.
 */
export function deepCopyYMap(source, target) {
  source.forEach((value, key) => {
    if (value instanceof Y.Map) {
      const nested = new Y.Map()
      target.set(key, nested)
      deepCopyYMap(value, nested)
    } else if (value instanceof Y.Array) {
      const nested = new Y.Array()
      target.set(key, nested)
      nested.push(value.toArray())
    } else {
      target.set(key, value)
    }
  })
}

/**
 * Recursively write a plain JS object into a Y.Map.
 * Object values become nested Y.Maps; arrays become Y.Arrays.
 * MUST be called inside a doc.transact() block.
 */
export function jsonToYMap(yMap, obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      yMap.set(key, value ?? null)
    } else if (Array.isArray(value)) {
      const arr = new Y.Array()
      yMap.set(key, arr)
      arr.push(value)
    } else if (typeof value === 'object') {
      const nested = new Y.Map()
      yMap.set(key, nested)
      jsonToYMap(nested, value)
    } else {
      yMap.set(key, value)
    }
  }
}
