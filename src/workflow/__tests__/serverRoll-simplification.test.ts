import { describe, it, expect } from 'vitest'

describe('RollRequest type contract', () => {
  it('RollRequest only contains dice field', () => {
    const request: import('../../shared/logTypes').RollRequest = {
      dice: [{ sides: 6, count: 2 }],
    }
    expect(request.dice).toHaveLength(1)
    expect(request.dice[0]).toEqual({ sides: 6, count: 2 })
  })

  it('RollRequestAck is either rolls or error', () => {
    const success: import('../../shared/logTypes').RollRequestAck = {
      rolls: [[3, 5]],
    }
    expect('rolls' in success).toBe(true)

    const failure: import('../../shared/logTypes').RollRequestAck = {
      error: 'bad dice',
    }
    expect('error' in failure).toBe(true)
  })
})
