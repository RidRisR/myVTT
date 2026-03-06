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
  rolls: number[]
  modifier: number
  total: number
  timestamp: number
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
