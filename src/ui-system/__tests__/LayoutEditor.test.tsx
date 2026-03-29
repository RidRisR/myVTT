import { describe, it, expect, vi } from 'vitest'
import { applyDrag, createDragInitiator } from '../LayoutEditor'
import type { LayoutConfig } from '../types'

describe('applyDrag', () => {
  const layout: LayoutConfig = {
    'test.panel#1': { x: 100, y: 100, width: 200, height: 100, zOrder: 0 },
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

describe('createDragInitiator', () => {
  it('calls onDrag with correct delta on mousemove', () => {
    const onDrag = vi.fn()
    const initiator = createDragInitiator('test.panel#1', onDrag)

    initiator({ clientX: 100, clientY: 100, preventDefault: vi.fn() })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, clientY: 90, bubbles: true }))

    expect(onDrag).toHaveBeenCalledWith('test.panel#1', { dx: 30, dy: -10 })

    // cleanup
    window.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('stops calling onDrag after mouseup', () => {
    const onDrag = vi.fn()
    const initiator = createDragInitiator('test.panel#1', onDrag)

    initiator({ clientX: 100, clientY: 100, preventDefault: vi.fn() })
    window.dispatchEvent(new MouseEvent('mouseup'))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200, bubbles: true }))

    expect(onDrag).not.toHaveBeenCalled()
  })
})
