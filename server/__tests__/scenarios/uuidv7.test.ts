// @vitest-environment node
// server/__tests__/scenarios/uuidv7.test.ts
// Unit test: UUID v7 format and ordering
import { describe, it, expect } from 'vitest'
import { uuidv7 } from '../../uuidv7'

describe('uuidv7', () => {
  it('produces valid UUID format (8-4-4-4-12 hex)', () => {
    const id = uuidv7()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('version nibble is 7', () => {
    const id = uuidv7()
    // Version is the high nibble of the 7th byte, which is the 13th hex char (index 14 in the formatted string, after 8+1+4+1)
    const versionChar = id.charAt(14)
    expect(versionChar).toBe('7')
  })

  it('variant bits are 10xx (high nibble of byte 8 is 8, 9, a, or b)', () => {
    const id = uuidv7()
    // Variant is the high nibble of byte 8, which is the 19th hex char (index 19 in formatted string)
    const variantChar = id.charAt(19)
    expect(['8', '9', 'a', 'b']).toContain(variantChar)
  })

  it('IDs generated across different milliseconds are lexicographically ordered', async () => {
    const id1 = uuidv7()
    await new Promise((resolve) => setTimeout(resolve, 10))
    const id2 = uuidv7()
    expect(id1 < id2).toBe(true)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidv7()))
    expect(ids.size).toBe(100)
  })
})
