import { describe, it, expect } from 'vitest'
import { uuidv7 } from '../uuidv7'

describe('uuidv7', () => {
  it('returns valid UUID v7 format', () => {
    const id = uuidv7()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidv7()))
    expect(ids.size).toBe(100)
  })
  it('ids are monotonically sortable by timestamp', async () => {
    const a = uuidv7()
    // Wait 2ms to guarantee a different millisecond timestamp
    await new Promise((r) => setTimeout(r, 2))
    const b = uuidv7()
    expect(a < b).toBe(true)
  })
})
