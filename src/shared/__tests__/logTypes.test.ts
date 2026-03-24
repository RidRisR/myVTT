import { describe, it, expectTypeOf } from 'vitest'
import type { GameLogEntry, Visibility } from '../logTypes'

describe('logTypes compile-time checks', () => {
  it('GameLogEntry has required fields', () => {
    expectTypeOf<GameLogEntry>().toHaveProperty('seq')
    expectTypeOf<GameLogEntry>().toHaveProperty('executor')
    expectTypeOf<GameLogEntry>().toHaveProperty('triggerable')
  })
  it('Visibility discriminates correctly', () => {
    const pub: Visibility = {}
    const inc: Visibility = { include: ['gm'] }
    const exc: Visibility = { exclude: ['seat-1'] }
    expectTypeOf(pub).toExtend<Visibility>()
    expectTypeOf(inc).toExtend<Visibility>()
    expectTypeOf(exc).toExtend<Visibility>()
  })
})
