export interface ParsedDice {
  count: number
  sides: number
  modifier: number
}

export interface DiceResult {
  expression: string
  rolls: number[]
  modifier: number
  total: number
}

export interface DiceLogEntry {
  id: string
  roller: string
  expression: string
  resolvedExpression?: string
  rolls: number[]
  modifier: number
  total: number
  timestamp: number
}

export interface ResolveSource {
  key: string
  value: string
  from: 'token' | 'seat'
}

export type ResolveResult =
  | { resolved: string; sources: ResolveSource[] }
  | { error: string }

export function resolveFormula(
  formula: string,
  tokenProps: { key: string; value: string }[],
  seatProps: { key: string; value: string }[],
): ResolveResult {
  const sources: ResolveSource[] = []
  let error: string | null = null

  const resolved = formula.replace(/@([\p{L}\p{N}_]+)/gu, (_match, key: string) => {
    if (error) return _match

    // Token props first, then seat props
    const tokenProp = tokenProps.find((p) => p.key === key)
    const seatProp = seatProps.find((p) => p.key === key)
    const prop = tokenProp ?? seatProp
    const from = tokenProp ? 'token' as const : 'seat' as const

    if (!prop) {
      error = `Unknown key: ${key}`
      return _match
    }

    // HP format "15/20" → extract current value
    const hpMatch = prop.value.match(/^(\d+)\/\d+$/)
    const value = hpMatch ? hpMatch[1] : prop.value

    if (!/^-?\d+$/.test(value)) {
      error = `@${key} value "${prop.value}" is not numeric`
      return _match
    }

    sources.push({ key, value, from })
    return value
  })

  if (error) return { error }
  return { resolved, sources }
}

/**
 * Parse a dice expression like "2d6+5", "d20", "3d8-2"
 */
export function parseDiceExpression(expr: string): ParsedDice | null {
  const match = expr.trim().match(/^(\d*)d(\d+)([+-]\d+)?$/i)
  if (!match) return null

  const count = match[1] ? parseInt(match[1], 10) : 1
  const sides = parseInt(match[2], 10)
  const modifier = match[3] ? parseInt(match[3], 10) : 0

  if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null

  return { count, sides, modifier }
}

/**
 * Roll dice based on parsed expression
 */
export function rollDice(expression: string): DiceResult | null {
  const parsed = parseDiceExpression(expression)
  if (!parsed) return null

  const rolls: number[] = []
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(Math.floor(Math.random() * parsed.sides) + 1)
  }

  const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier

  return {
    expression,
    rolls,
    modifier: parsed.modifier,
    total,
  }
}
