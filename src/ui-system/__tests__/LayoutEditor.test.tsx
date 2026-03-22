import { describe, it, expect } from 'vitest'
import { applyDrag } from '../LayoutEditor'
import type { LayoutConfig } from '../types'

describe('applyDrag', () => {
  const layout: LayoutConfig = {
    'test.panel#1': { x: 100, y: 100, width: 200, height: 100 },
  }

  it('moves a panel by the drag delta', () => {
    const updated = applyDrag(layout, 'test.panel#1', { dx: 30, dy: -10 })
    const entry = updated['test.panel#1']
    expect(entry).toBeDefined()
    if (entry) {
      expect(entry.x).toBe(130)
      expect(entry.y).toBe(90)
    }
  })

  it('does not mutate the original layout', () => {
    applyDrag(layout, 'test.panel#1', { dx: 10, dy: 10 })
    const entry = layout['test.panel#1']
    expect(entry).toBeDefined()
    if (entry) {
      expect(entry.x).toBe(100)
    }
  })

  it('ignores drag for unknown instance key', () => {
    const updated = applyDrag(layout, 'unknown#1', { dx: 10, dy: 10 })
    expect(updated).toEqual(layout)
  })
})
