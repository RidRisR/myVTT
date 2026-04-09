// Polyfill if needed — jsdom does not have PointerEvent
if (typeof PointerEvent === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    pointerId: number
    constructor(type: string, init?: PointerEventInit) {
      super(type, init)
      this.pointerId = init?.pointerId ?? 0
    }
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPointerDragHandler, createPointerResizeHandler } from '../usePointerDrag'

describe('createPointerDragHandler', () => {
  let target: HTMLDivElement

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  it('calls onMove with delta on pointermove', () => {
    const onMove = vi.fn()
    const handler = createPointerDragHandler(onMove)

    const down = new PointerEvent('pointerdown', { clientX: 100, clientY: 200, pointerId: 1 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    target.setPointerCapture = vi.fn()
    handler(down)

    const move = new PointerEvent('pointermove', { clientX: 110, clientY: 220 })
    target.dispatchEvent(move)

    expect(onMove).toHaveBeenCalledWith({ dx: 10, dy: 20 })
  })

  it('accumulates deltas across multiple moves', () => {
    const onMove = vi.fn()
    const handler = createPointerDragHandler(onMove)

    const down = new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    target.setPointerCapture = vi.fn()
    handler(down)

    target.dispatchEvent(new PointerEvent('pointermove', { clientX: 105, clientY: 103 }))
    target.dispatchEvent(new PointerEvent('pointermove', { clientX: 115, clientY: 110 }))

    expect(onMove).toHaveBeenCalledTimes(2)
    expect(onMove).toHaveBeenNthCalledWith(1, { dx: 5, dy: 3 })
    expect(onMove).toHaveBeenNthCalledWith(2, { dx: 10, dy: 7 })
  })

  it('calls onEnd on pointerup and stops tracking', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const handler = createPointerDragHandler(onMove, onEnd)

    const down = new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    target.setPointerCapture = vi.fn()
    handler(down)

    target.dispatchEvent(new PointerEvent('pointerup', {}))
    expect(onEnd).toHaveBeenCalledTimes(1)

    // Further moves should not trigger onMove
    target.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 200 }))
    expect(onMove).toHaveBeenCalledTimes(0)
  })

  it('sets pointer capture on the target', () => {
    const handler = createPointerDragHandler(vi.fn())
    target.setPointerCapture = vi.fn()

    const down = new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 42 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    handler(down)

    expect(target.setPointerCapture).toHaveBeenCalledWith(42)
  })
})

describe('createPointerResizeHandler', () => {
  let target: HTMLDivElement

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  it('calls onResize with size delta', () => {
    const onResize = vi.fn()
    const handler = createPointerResizeHandler(onResize)

    const down = new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    target.setPointerCapture = vi.fn()
    handler(down)

    target.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 110 }))
    expect(onResize).toHaveBeenCalledWith({ dw: 20, dh: 10 })
  })

  it('calls onEnd on pointerup', () => {
    const onResize = vi.fn()
    const onEnd = vi.fn()
    const handler = createPointerResizeHandler(onResize, onEnd)

    const down = new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    target.setPointerCapture = vi.fn()
    handler(down)

    target.dispatchEvent(new PointerEvent('pointerup', {}))
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
