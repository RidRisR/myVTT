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

/** A single parsed term in a compound expression */
export type DiceTerm =
  | {
      type: 'dice'
      sign: 1 | -1
      count: number
      sides: number
      keepDrop?: {
        mode: 'kh' | 'kl' | 'dh' | 'dl'
        count: number
      }
    }
  | {
      type: 'constant'
      sign: 1 | -1
      value: number
    }

/** Result of rolling a single dice term */
export interface DiceTermResult {
  term: DiceTerm
  allRolls: number[]
  keptIndices: number[]
  subtotal: number
}

/** Result of evaluating a full compound expression */
export interface CompoundDiceResult {
  expression: string
  termResults: DiceTermResult[]
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
  terms?: DiceTermResult[]
}

export interface ResolveSource {
  key: string
  value: string
  from: 'token' | 'seat'
}

export type ResolveResult = { resolved: string; sources: ResolveSource[] } | { error: string }

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
    const from = tokenProp ? ('token' as const) : ('seat' as const)

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

export function generateFavoriteName(formula: string): string {
  const keys = [...formula.matchAll(/@([\p{L}\p{N}_]+)/gu)].map((m) => m[1])
  if (keys.length === 0) return formula.trim()
  return keys.join('+') + ' Roll'
}

/**
 * Tokenize a compound expression into an array of DiceTerms.
 * Supports: constants, NdM dice, keep/drop modifiers (kh, kl, dh, dl).
 * Examples: "2d6+3", "4d6kh3+1d20-5", "-3+2d6dl1"
 */
export function tokenizeExpression(expr: string): DiceTerm[] | null {
  let normalized = expr.replace(/\s/g, '')
  if (!normalized) return null
  if (normalized[0] !== '+' && normalized[0] !== '-') {
    normalized = '+' + normalized
  }

  const termRegex = /([+-])(\d*d\d+(?:(?:kh|kl|dh|dl)\d*)?|\d+)/gi
  const matches = [...normalized.matchAll(termRegex)]
  if (matches.length === 0) return null

  // Validate: matched content must account for entire expression
  const consumed = matches.reduce((sum, m) => sum + m[0].length, 0)
  if (consumed !== normalized.length) return null

  const terms: DiceTerm[] = []

  for (const match of matches) {
    const sign: 1 | -1 = match[1] === '-' ? -1 : 1
    const body = match[2]

    const diceMatch = body.match(/^(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d*))?$/i)
    if (diceMatch) {
      const count = diceMatch[1] ? parseInt(diceMatch[1], 10) : 1
      const sides = parseInt(diceMatch[2], 10)
      const term: DiceTerm = { type: 'dice', sign, count, sides }
      if (diceMatch[3]) {
        term.keepDrop = {
          mode: diceMatch[3].toLowerCase() as 'kh' | 'kl' | 'dh' | 'dl',
          count: diceMatch[4] ? parseInt(diceMatch[4], 10) : 1,
        }
      }
      terms.push(term)
    } else {
      const value = parseInt(body, 10)
      if (isNaN(value)) return null
      terms.push({ type: 'constant', sign, value })
    }
  }

  return terms.length > 0 ? terms : null
}

/**
 * Validate a single DiceTerm for bounds.
 * Returns an error string if invalid, or null if valid.
 */
export function validateTerm(term: DiceTerm): string | null {
  if (term.type === 'constant') {
    if (term.value > 10000) return `Constant ${term.value} exceeds maximum (10000)`
    return null
  }

  if (term.count < 1) return 'Dice count must be at least 1'
  if (term.count > 100) return 'Cannot roll more than 100 dice at once'
  if (term.sides < 1) return 'Dice must have at least 1 side'
  if (term.sides > 1000) return 'Dice cannot have more than 1000 sides'

  if (term.keepDrop) {
    const { mode, count } = term.keepDrop
    if (count < 1) return `${mode} count must be at least 1`
    if (mode === 'kh' || mode === 'kl') {
      if (count > term.count) return `Cannot keep ${count} dice when only rolling ${term.count}`
    }
    if (mode === 'dh' || mode === 'dl') {
      if (count >= term.count)
        return `Cannot drop ${count} dice when only rolling ${term.count} (nothing left)`
    }
  }

  return null
}

/**
 * Roll a single DiceTerm, producing a DiceTermResult.
 */
export function rollTerm(term: DiceTerm): DiceTermResult {
  if (term.type === 'constant') {
    return { term, allRolls: [], keptIndices: [], subtotal: term.sign * term.value }
  }

  const allRolls = Array.from(
    { length: term.count },
    () => Math.floor(Math.random() * term.sides) + 1,
  )

  let keptIndices: number[]
  if (!term.keepDrop) {
    keptIndices = allRolls.map((_, i) => i)
  } else {
    const indexed = allRolls.map((v, i) => ({ i, v }))
    indexed.sort((a, b) => a.v - b.v)

    const { mode, count } = term.keepDrop
    let keptSet: Set<number>

    switch (mode) {
      case 'kh':
        keptSet = new Set(indexed.slice(-count).map((x) => x.i))
        break
      case 'kl':
        keptSet = new Set(indexed.slice(0, count).map((x) => x.i))
        break
      case 'dh':
        keptSet = new Set(indexed.slice(0, -count).map((x) => x.i))
        break
      case 'dl':
        keptSet = new Set(indexed.slice(count).map((x) => x.i))
        break
    }

    keptIndices = allRolls.map((_, i) => i).filter((i) => keptSet.has(i))
  }

  const subtotal = term.sign * keptIndices.reduce((sum, i) => sum + allRolls[i], 0)
  return { term, allRolls, keptIndices, subtotal }
}

/**
 * Parse and roll a compound expression. Main entry point.
 * Returns null if parsing fails, or { error } if validation fails.
 */
export function rollCompound(expression: string): CompoundDiceResult | { error: string } | null {
  const terms = tokenizeExpression(expression)
  if (!terms) return null

  if (terms.length > 20) return { error: 'Too many terms (max 20)' }

  const totalDice = terms.reduce((sum, t) => sum + (t.type === 'dice' ? t.count : 0), 0)
  if (totalDice > 200) return { error: 'Too many dice (max 200 total)' }

  for (const term of terms) {
    const err = validateTerm(term)
    if (err) return { error: err }
  }

  const termResults = terms.map((t) => rollTerm(t))
  const total = termResults.reduce((sum, tr) => sum + tr.subtotal, 0)

  return { expression, termResults, total }
}

/**
 * @deprecated Use tokenizeExpression + rollCompound instead
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

/** Minimal dice specification sent to server (no keep/drop logic — that's handled client-side) */
export interface DiceSpec {
  sides: number
  count: number
}

/** Extract dice specs from parsed terms (dice terms only, constants ignored) */
export function toDiceSpecs(terms: DiceTerm[]): DiceSpec[] {
  return terms
    .filter((t): t is Extract<DiceTerm, { type: 'dice' }> => t.type === 'dice')
    .map((t) => ({ sides: t.sides, count: t.count }))
}

/**
 * Reconstruct a DiceTermResult from a pre-existing array of rolls (server-generated).
 * Applies keep/drop logic identically to rollTerm, but uses provided rolls instead of generating new ones.
 */
export function buildTermResult(term: DiceTerm, allRolls: number[]): DiceTermResult {
  if (term.type === 'constant') {
    return { term, allRolls: [], keptIndices: [], subtotal: term.sign * term.value }
  }

  // Guard: server must generate exactly term.count rolls for this dice term
  if (allRolls.length < term.count) {
    throw new Error(
      `buildTermResult: expected ${term.count} rolls for ${term.count}d${term.sides}, got ${allRolls.length}`,
    )
  }

  let keptIndices: number[]
  if (!term.keepDrop) {
    keptIndices = allRolls.map((_, i) => i)
  } else {
    const indexed = allRolls.map((v, i) => ({ i, v }))
    indexed.sort((a, b) => a.v - b.v)
    const { mode, count } = term.keepDrop
    let keptSet: Set<number>
    switch (mode) {
      case 'kh':
        keptSet = new Set(indexed.slice(-count).map((x) => x.i))
        break
      case 'kl':
        keptSet = new Set(indexed.slice(0, count).map((x) => x.i))
        break
      case 'dh':
        keptSet = new Set(indexed.slice(0, -count).map((x) => x.i))
        break
      case 'dl':
        keptSet = new Set(indexed.slice(count).map((x) => x.i))
        break
      default: {
        const _exhaust: never = mode
        throw new Error(`Unknown keep/drop mode: ${_exhaust}`)
      }
    }
    keptIndices = allRolls.map((_, i) => i).filter((i) => keptSet.has(i))
  }

  const subtotal = term.sign * keptIndices.reduce((sum, i) => sum + allRolls[i], 0)
  return { term, allRolls, keptIndices, subtotal }
}

/**
 * Reconstruct full compound result from server-generated rolls.
 * terms = output of tokenizeExpression(formula)
 * rolls = server-generated raw numbers, one array per dice term (in order)
 */
export function buildCompoundResult(
  terms: DiceTerm[],
  rolls: number[][],
): { termResults: DiceTermResult[]; total: number } {
  let rollIndex = 0
  const termResults = terms.map((term) => {
    if (term.type === 'constant') return buildTermResult(term, [])
    return buildTermResult(term, rolls[rollIndex++] ?? [])
  })
  const total = termResults.reduce((sum, tr) => sum + tr.subtotal, 0)
  return { termResults, total }
}
