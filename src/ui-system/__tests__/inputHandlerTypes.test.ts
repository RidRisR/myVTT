import { describe, it, expectTypeOf } from 'vitest'
import type { InputResult, InputHandlerProps, InputHandlerDef } from '../inputHandlerTypes'

describe('inputHandlerTypes compile-time checks', () => {
  it('InputResult discriminates on ok field', () => {
    const success: InputResult<number> = { ok: true, value: 42 }
    const failure: InputResult<number> = { ok: false, reason: 'cancelled' }
    expectTypeOf(success).toMatchTypeOf<InputResult<number>>()
    expectTypeOf(failure).toMatchTypeOf<InputResult<number>>()
  })

  it('InputHandlerProps has context, resolve, cancel', () => {
    expectTypeOf<InputHandlerProps<{ x: number }, string>>().toHaveProperty('context')
    expectTypeOf<InputHandlerProps<{ x: number }, string>>().toHaveProperty('resolve')
    expectTypeOf<InputHandlerProps<{ x: number }, string>>().toHaveProperty('cancel')
  })

  it('InputHandlerDef has component field', () => {
    expectTypeOf<InputHandlerDef>().toHaveProperty('component')
  })
})
