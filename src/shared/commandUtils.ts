// src/shared/commandUtils.ts

/**
 * Parse a chat command string into command name and raw arguments.
 * Returns null if the input is not a valid command.
 *
 * Examples:
 *   ".r 2d6"      → { name: ".r",    raw: "2d6" }
 *   ".dd @agility" → { name: ".dd",   raw: "@agility" }
 *   "hello"        → null
 */
export function parseCommand(input: string): { name: string; raw: string } | null {
  const match = input.match(/^\.([a-zA-Z][a-zA-Z0-9]*)\s*(.*)$/i)
  if (!match) return null
  return {
    name: '.' + (match[1] ?? '').toLowerCase(),
    raw: (match[2] ?? '').trim(),
  }
}
