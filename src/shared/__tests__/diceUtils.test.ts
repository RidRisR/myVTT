import {
  tokenizeExpression,
  validateTerm,
  rollTerm,
  rollCompound,
  resolveFormula,
  generateFavoriteName,
  rollDice,
  buildTermResult,
  buildCompoundResult,
  toDiceSpecs,
  type DiceTerm,
} from '../diceUtils'

// ── tokenizeExpression ──────────────────────────────────────────

describe('tokenizeExpression', () => {
  it('parses simple dice "2d6"', () => {
    const terms = tokenizeExpression('2d6')
    expect(terms).toEqual([{ type: 'dice', sign: 1, count: 2, sides: 6 }])
  })

  it('parses constant "5"', () => {
    const terms = tokenizeExpression('5')
    expect(terms).toEqual([{ type: 'constant', sign: 1, value: 5 }])
  })

  it('parses negative constant "-3"', () => {
    const terms = tokenizeExpression('-3')
    expect(terms).toEqual([{ type: 'constant', sign: -1, value: 3 }])
  })

  it('parses compound "2d6+3"', () => {
    const terms = tokenizeExpression('2d6+3')
    expect(terms).not.toBeNull()
    expect(terms).toHaveLength(2)
    expect(terms?.[0]).toMatchObject({ type: 'dice', count: 2, sides: 6 })
    expect(terms?.[1]).toMatchObject({ type: 'constant', value: 3 })
  })

  it('parses keep/drop "4d6kh3"', () => {
    const terms = tokenizeExpression('4d6kh3')
    expect(terms?.[0]).toMatchObject({
      type: 'dice',
      count: 4,
      sides: 6,
      keepDrop: { mode: 'kh', count: 3 },
    })
  })

  it('parses multi-term "4d6kh3+1d20-5"', () => {
    const terms = tokenizeExpression('4d6kh3+1d20-5')
    expect(terms).not.toBeNull()
    expect(terms).toHaveLength(3)
    expect(terms?.[0]).toMatchObject({ type: 'dice', count: 4, keepDrop: { mode: 'kh', count: 3 } })
    expect(terms?.[1]).toMatchObject({ type: 'dice', count: 1, sides: 20, sign: 1 })
    expect(terms?.[2]).toMatchObject({ type: 'constant', sign: -1, value: 5 })
  })

  it('defaults count to 1 for "d20"', () => {
    const terms = tokenizeExpression('d20')
    expect(terms?.[0]).toMatchObject({ type: 'dice', count: 1, sides: 20 })
  })

  it('defaults keepDrop count to 1 for "2d20kh"', () => {
    const terms = tokenizeExpression('2d20kh')
    expect(terms?.[0]).toMatchObject({ keepDrop: { mode: 'kh', count: 1 } })
  })

  it('returns null for empty string', () => {
    expect(tokenizeExpression('')).toBeNull()
  })

  it('returns null for non-dice string "abc"', () => {
    expect(tokenizeExpression('abc')).toBeNull()
  })

  it('returns null for partial invalid "2d6+abc"', () => {
    expect(tokenizeExpression('2d6+abc')).toBeNull()
  })

  it('tolerates whitespace " 2d6 + 3 "', () => {
    const terms = tokenizeExpression(' 2d6 + 3 ')
    expect(terms).toHaveLength(2)
  })
})

// ── validateTerm ────────────────────────────────────────────────

describe('validateTerm', () => {
  it('returns null for valid dice', () => {
    expect(validateTerm({ type: 'dice', sign: 1, count: 2, sides: 6 })).toBeNull()
  })

  it('returns null for valid constant', () => {
    expect(validateTerm({ type: 'constant', sign: 1, value: 100 })).toBeNull()
  })

  it('rejects constant > 10000', () => {
    expect(validateTerm({ type: 'constant', sign: 1, value: 10001 })).toContain('10000')
  })

  it('rejects count < 1', () => {
    expect(validateTerm({ type: 'dice', sign: 1, count: 0, sides: 6 })).toContain('at least 1')
  })

  it('rejects count > 100', () => {
    expect(validateTerm({ type: 'dice', sign: 1, count: 101, sides: 6 })).toContain('100')
  })

  it('rejects sides < 1', () => {
    expect(validateTerm({ type: 'dice', sign: 1, count: 1, sides: 0 })).toContain('at least 1')
  })

  it('rejects sides > 1000', () => {
    expect(validateTerm({ type: 'dice', sign: 1, count: 1, sides: 1001 })).toContain('1000')
  })

  it('rejects kh count > dice count', () => {
    const term: DiceTerm = {
      type: 'dice',
      sign: 1,
      count: 2,
      sides: 6,
      keepDrop: { mode: 'kh', count: 3 },
    }
    expect(validateTerm(term)).toContain('Cannot keep')
  })

  it('rejects dl count >= dice count', () => {
    const term: DiceTerm = {
      type: 'dice',
      sign: 1,
      count: 2,
      sides: 6,
      keepDrop: { mode: 'dl', count: 2 },
    }
    expect(validateTerm(term)).toContain('nothing left')
  })
})

// ── rollTerm ────────────────────────────────────────────────────

describe('rollTerm', () => {
  it('rolls constant term', () => {
    const result = rollTerm({ type: 'constant', sign: 1, value: 5 })
    expect(result.subtotal).toBe(5)
    expect(result.allRolls).toEqual([])
    expect(result.keptIndices).toEqual([])
  })

  it('rolls constant with negative sign', () => {
    const result = rollTerm({ type: 'constant', sign: -1, value: 3 })
    expect(result.subtotal).toBe(-3)
  })

  it('rolls plain dice with mocked random', () => {
    // Mock Math.random to return 0.0, 0.5 → for d6: floor(0*6)+1=1, floor(0.5*6)+1=4
    const spy = vi.spyOn(Math, 'random').mockReturnValueOnce(0.0).mockReturnValueOnce(0.5)
    const result = rollTerm({ type: 'dice', sign: 1, count: 2, sides: 6 })
    expect(result.allRolls).toEqual([1, 4])
    expect(result.keptIndices).toEqual([0, 1])
    expect(result.subtotal).toBe(5)
    spy.mockRestore()
  })

  it('keeps highest with kh', () => {
    // 4d6kh3: rolls [1, 5, 3, 6] → keep 5, 3, 6 (indices 1, 2, 3)
    const spy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0 / 6) // 1
      .mockReturnValueOnce(4 / 6) // 5
      .mockReturnValueOnce(2 / 6) // 3
      .mockReturnValueOnce(5 / 6) // 6
    const result = rollTerm({
      type: 'dice',
      sign: 1,
      count: 4,
      sides: 6,
      keepDrop: { mode: 'kh', count: 3 },
    })
    expect(result.allRolls).toEqual([1, 5, 3, 6])
    expect(result.keptIndices).toEqual([1, 2, 3])
    expect(result.subtotal).toBe(14)
    spy.mockRestore()
  })

  it('keeps lowest with kl', () => {
    // 4d6kl1: rolls [3, 1, 5, 2] → keep 1 (index 1)
    const spy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(2 / 6) // 3
      .mockReturnValueOnce(0 / 6) // 1
      .mockReturnValueOnce(4 / 6) // 5
      .mockReturnValueOnce(1 / 6) // 2
    const result = rollTerm({
      type: 'dice',
      sign: 1,
      count: 4,
      sides: 6,
      keepDrop: { mode: 'kl', count: 1 },
    })
    expect(result.keptIndices).toEqual([1])
    expect(result.subtotal).toBe(1)
    spy.mockRestore()
  })

  it('drops highest with dh', () => {
    // 3d6dh1: rolls [2, 6, 4] → drop 6, keep 2+4=6
    const spy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(1 / 6) // 2
      .mockReturnValueOnce(5 / 6) // 6
      .mockReturnValueOnce(3 / 6) // 4
    const result = rollTerm({
      type: 'dice',
      sign: 1,
      count: 3,
      sides: 6,
      keepDrop: { mode: 'dh', count: 1 },
    })
    expect(result.keptIndices).toEqual([0, 2])
    expect(result.subtotal).toBe(6)
    spy.mockRestore()
  })

  it('drops lowest with dl', () => {
    // 3d6dl1: rolls [2, 6, 4] → drop 2, keep 6+4=10
    const spy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(1 / 6) // 2
      .mockReturnValueOnce(5 / 6) // 6
      .mockReturnValueOnce(3 / 6) // 4
    const result = rollTerm({
      type: 'dice',
      sign: 1,
      count: 3,
      sides: 6,
      keepDrop: { mode: 'dl', count: 1 },
    })
    expect(result.keptIndices).toEqual([1, 2])
    expect(result.subtotal).toBe(10)
    spy.mockRestore()
  })

  it('applies negative sign to dice subtotal', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValueOnce(3 / 6) // 4
    const result = rollTerm({ type: 'dice', sign: -1, count: 1, sides: 6 })
    expect(result.subtotal).toBe(-4)
    spy.mockRestore()
  })
})

// ── rollCompound ────────────────────────────────────────────────

describe('rollCompound', () => {
  it('rolls a valid compound expression', () => {
    // "2d6+3": mock rolls [3, 4] → total = 3+4+3 = 10
    const spy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(2 / 6) // 3
      .mockReturnValueOnce(3 / 6) // 4
    const result = rollCompound('2d6+3')
    expect(result).not.toBeNull()
    expect(result).not.toHaveProperty('error')
    const r = result as { expression: string; total: number }
    expect(r.expression).toBe('2d6+3')
    expect(r.total).toBe(10)
    spy.mockRestore()
  })

  it('returns null for invalid input', () => {
    expect(rollCompound('abc')).toBeNull()
  })

  it('returns error for too many terms (>20)', () => {
    const expr = Array(21).fill('1').join('+')
    const result = rollCompound(expr) as { error: string }
    expect(result.error).toContain('Too many terms')
  })

  it('returns error for too many dice (>200)', () => {
    // 3 terms of 100d6 = 300 dice
    const result = rollCompound('100d6+100d6+100d6') as { error: string }
    expect(result.error).toContain('Too many dice')
  })

  it('returns error when validation fails', () => {
    // 0d6 has count < 1
    const result = rollCompound('0d6') as { error: string }
    expect(result.error).toBeTruthy()
  })
})

// ── resolveFormula ──────────────────────────────────────────────

describe('resolveFormula', () => {
  const tokenProps = [
    { key: 'str', value: '10' },
    { key: 'hp', value: '15/20' },
  ]
  const seatProps = [{ key: 'level', value: '5' }]

  it('resolves @key from tokenProps', () => {
    const result = resolveFormula('@str+1d20', tokenProps, seatProps)
    expect(result).toEqual({
      resolved: '10+1d20',
      sources: [{ key: 'str', value: '10', from: 'token' }],
    })
  })

  it('extracts current from HP format @hp "15/20" → "15"', () => {
    const result = resolveFormula('@hp', tokenProps, seatProps)
    expect(result).toEqual({
      resolved: '15',
      sources: [{ key: 'hp', value: '15', from: 'token' }],
    })
  })

  it('resolves @key from seatProps', () => {
    const result = resolveFormula('@level', tokenProps, seatProps)
    expect(result).toEqual({
      resolved: '5',
      sources: [{ key: 'level', value: '5', from: 'seat' }],
    })
  })

  it('returns error for unknown key', () => {
    const result = resolveFormula('@unknown', tokenProps, seatProps)
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('Unknown key')
  })

  it('returns error for non-numeric value', () => {
    const result = resolveFormula('@name', [{ key: 'name', value: 'abc' }], [])
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('not numeric')
  })

  it('prefers token over seat for same key', () => {
    const result = resolveFormula(
      '@str',
      [{ key: 'str', value: '18' }],
      [{ key: 'str', value: '10' }],
    )
    expect(result).toEqual({
      resolved: '18',
      sources: [{ key: 'str', value: '18', from: 'token' }],
    })
  })

  it('resolves multiple keys', () => {
    const result = resolveFormula('@str+@level', tokenProps, seatProps)
    expect(result).toEqual({
      resolved: '10+5',
      sources: [
        { key: 'str', value: '10', from: 'token' },
        { key: 'level', value: '5', from: 'seat' },
      ],
    })
  })
})

// ── generateFavoriteName ────────────────────────────────────────

describe('generateFavoriteName', () => {
  it('returns trimmed formula when no @keys', () => {
    expect(generateFavoriteName('  2d6+3  ')).toBe('2d6+3')
  })

  it('returns "key Roll" for single key', () => {
    expect(generateFavoriteName('@str+1d20')).toBe('str Roll')
  })

  it('joins multiple keys', () => {
    expect(generateFavoriteName('@str+@dex')).toBe('str+dex Roll')
  })
})

// ── rollDice ─────────────────

describe('rollDice', () => {
  it('rolls and returns correct structure', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValueOnce(0.5)
    const result = rollDice('d6')
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.expression).toBe('d6')
    expect(result.rolls).toHaveLength(1)
    expect(result.rolls[0]).toBeGreaterThanOrEqual(1)
    expect(result.rolls[0]).toBeLessThanOrEqual(6)
    expect(result.modifier).toBe(0)
    expect(result.total).toBe(result.rolls[0])
    spy.mockRestore()
  })

  it('returns null for invalid expression', () => {
    expect(rollDice('abc')).toBeNull()
  })
})

describe('buildTermResult', () => {
  it('constant term returns subtotal = sign * value', () => {
    const term: DiceTerm = { type: 'constant', value: 5, sign: 1 }
    const r = buildTermResult(term, [])
    expect(r.subtotal).toBe(5)
    expect(r.allRolls).toEqual([])
    expect(r.keptIndices).toEqual([])
  })

  it('constant negative sign', () => {
    const term: DiceTerm = { type: 'constant', value: 3, sign: -1 }
    expect(buildTermResult(term, []).subtotal).toBe(-3)
  })

  it('no keep/drop — all rolls kept', () => {
    const r = buildTermResult({ type: 'dice', sides: 6, count: 3, sign: 1 }, [2, 4, 6])
    expect(r.keptIndices).toEqual([0, 1, 2])
    expect(r.subtotal).toBe(12)
  })

  it('kh keep highest 1 of 3', () => {
    const r = buildTermResult(
      { type: 'dice', sides: 6, count: 3, sign: 1, keepDrop: { mode: 'kh', count: 1 } },
      [2, 6, 4],
    )
    expect(r.keptIndices).toEqual([1]) // index of 6
    expect(r.subtotal).toBe(6)
  })

  it('kl keep lowest 1 of 3', () => {
    const r = buildTermResult(
      { type: 'dice', sides: 6, count: 3, sign: 1, keepDrop: { mode: 'kl', count: 1 } },
      [2, 6, 4],
    )
    expect(r.keptIndices).toEqual([0]) // index of 2
    expect(r.subtotal).toBe(2)
  })

  it('dl drop lowest 1 of 3', () => {
    const r = buildTermResult(
      { type: 'dice', sides: 6, count: 3, sign: 1, keepDrop: { mode: 'dl', count: 1 } },
      [2, 6, 4],
    )
    expect(r.keptIndices).toContain(1) // keeps 6
    expect(r.keptIndices).toContain(2) // keeps 4
    expect(r.keptIndices).not.toContain(0) // drops 2
    expect(r.subtotal).toBe(10)
  })

  it('dh drop highest 1 of 3', () => {
    const r = buildTermResult(
      { type: 'dice', sides: 6, count: 3, sign: 1, keepDrop: { mode: 'dh', count: 1 } },
      [2, 6, 4],
    )
    expect(r.keptIndices).not.toContain(1) // drops 6
    expect(r.subtotal).toBe(6)
  })

  it('throws if fewer rolls than term.count', () => {
    expect(() =>
      buildTermResult({ type: 'dice', sides: 6, count: 3, sign: 1 }, [1, 2]),
    ).toThrow()
  })

  it('throws if more rolls than term.count', () => {
    expect(() =>
      buildTermResult({ type: 'dice', sides: 6, count: 3, sign: 1 }, [1, 2, 3, 4]),
    ).toThrow()
  })
})

describe('buildCompoundResult', () => {
  it('single dice term', () => {
    const terms = tokenizeExpression('2d6') ?? []
    const { termResults, total } = buildCompoundResult(terms, [[3, 5]])
    expect(total).toBe(8)
    expect(termResults[0].allRolls).toEqual([3, 5])
  })

  it('dice + constant', () => {
    const terms = tokenizeExpression('2d6+3') ?? []
    const { termResults, total } = buildCompoundResult(terms, [[3, 5]])
    expect(total).toBe(11) // 3+5+3
    expect(termResults).toHaveLength(2)
  })

  it('multiple dice terms', () => {
    const terms = tokenizeExpression('1d20+1d4') ?? []
    const { total } = buildCompoundResult(terms, [[15], [3]])
    expect(total).toBe(18)
  })
})

describe('toDiceSpecs', () => {
  it('extracts only dice terms', () => {
    const terms = tokenizeExpression('2d6+3+1d4') ?? []
    const specs = toDiceSpecs(terms)
    expect(specs).toHaveLength(2)
    expect(specs[0]).toEqual({ sides: 6, count: 2 })
    expect(specs[1]).toEqual({ sides: 4, count: 1 })
  })

  it('returns empty for constants-only expression', () => {
    const terms = tokenizeExpression('5') ?? []
    expect(toDiceSpecs(terms)).toEqual([])
  })
})
