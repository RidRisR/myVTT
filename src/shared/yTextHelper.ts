// src/shared/yTextHelper.ts
// Helpers for reading/writing Y.Text fields with backward compat for plain strings.

import * as Y from 'yjs'

/** Read a field that might be Y.Text or plain string (backward compat) */
export function readTextField(yMap: Y.Map<unknown>, key: string): string {
  const val = yMap.get(key)
  if (val instanceof Y.Text) return val.toString()
  if (typeof val === 'string') return val
  return ''
}

/** Write a text field as Y.Text, creating a new Y.Text instance */
export function writeTextField(yMap: Y.Map<unknown>, key: string, text: string): void {
  const yText = new Y.Text()
  yText.insert(0, text)
  yMap.set(key, yText)
}

/** Update an existing Y.Text field in-place (replace all content) */
export function updateTextField(yMap: Y.Map<unknown>, key: string, text: string): void {
  const existing = yMap.get(key)
  if (existing instanceof Y.Text) {
    existing.delete(0, existing.length)
    if (text.length > 0) existing.insert(0, text)
  } else {
    // First time or migration from plain string: create Y.Text
    writeTextField(yMap, key, text)
  }
}
