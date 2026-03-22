import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeDnDSDK } from '../dnd'
import type { DnDPayload } from '../types'

// Helper: create a minimal mock DragEvent with a shared dataTransfer store
function makeDragEvent(storedPayload?: DnDPayload) {
  const store: Record<string, string> = {}
  if (storedPayload) {
    store['application/vtt-dnd'] = JSON.stringify(storedPayload)
  }
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      setData: vi.fn((key: string, val: string) => {
        store[key] = val
      }),
      getData: vi.fn((key: string) => store[key] ?? ''),
      effectAllowed: '' as string,
      dropEffect: '' as string,
    },
  }
}

// Helper: simulate a full drag sequence (start → ...) so activeDragPayload is populated
function startDrag(payload: DnDPayload) {
  const dnd = makeDnDSDK()
  const dragProps = dnd.makeDraggable(payload)
  const startEvent = makeDragEvent()
  dragProps.onDragStart?.(startEvent as unknown as React.DragEvent<HTMLElement>)
  return { dnd, dragProps, startEvent }
}

describe('makeDnDSDK — makeDraggable', () => {
  it('returns draggable: true', () => {
    const { dnd } = startDrag({ type: 'card', data: {} })
    const props = dnd.makeDraggable({ type: 'card', data: {} })
    expect(props.draggable).toBe(true)
  })

  it('stores payload via dataTransfer.setData on dragStart', () => {
    const payload: DnDPayload = { type: 'card', data: { id: 'fire-bolt' } }
    const { startEvent } = startDrag(payload)
    expect(startEvent.dataTransfer.setData).toHaveBeenCalledWith(
      'application/vtt-dnd',
      JSON.stringify(payload),
    )
  })

  it('clears activeDragPayload on dragEnd', () => {
    const payload: DnDPayload = { type: 'card', data: {} }
    const { dnd, dragProps } = startDrag(payload)
    dragProps.onDragEnd?.(makeDragEvent() as unknown as React.DragEvent<HTMLElement>)

    // After dragEnd, dragOver on a new drop zone should not trigger
    const onDrop = vi.fn()
    const dropProps = dnd.makeDropZone({ accept: ['card'], onDrop })
    const overEvent = makeDragEvent()
    dropProps.onDragOver?.(overEvent as unknown as React.DragEvent<HTMLElement>)
    expect(overEvent.preventDefault).not.toHaveBeenCalled()
  })
})

describe('makeDnDSDK — makeDropZone', () => {
  beforeEach(() => {
    // Reset active drag state between tests by simulating a clean dragEnd
    const dnd = makeDnDSDK()
    const props = dnd.makeDraggable({ type: '_reset', data: {} })
    props.onDragEnd?.(makeDragEvent() as unknown as React.DragEvent<HTMLElement>)
  })

  it('calls preventDefault on dragOver when type matches accept', () => {
    const payload: DnDPayload = { type: 'card', data: {} }
    const { dnd } = startDrag(payload)
    const onDrop = vi.fn()
    const dropProps = dnd.makeDropZone({ accept: ['card'], onDrop })
    const event = makeDragEvent()
    dropProps.onDragOver?.(event as unknown as React.DragEvent<HTMLElement>)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('does not call preventDefault when type not in accept', () => {
    const payload: DnDPayload = { type: 'card', data: {} }
    const { dnd } = startDrag(payload)
    const onDrop = vi.fn()
    const dropProps = dnd.makeDropZone({ accept: ['entity'], onDrop })
    const event = makeDragEvent()
    dropProps.onDragOver?.(event as unknown as React.DragEvent<HTMLElement>)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('does not call preventDefault when canDrop returns false', () => {
    const payload: DnDPayload = { type: 'card', data: { id: 'shield' } }
    const { dnd } = startDrag(payload)
    const onDrop = vi.fn()
    const dropProps = dnd.makeDropZone({
      accept: ['card'],
      canDrop: () => false,
      onDrop,
    })
    const event = makeDragEvent()
    dropProps.onDragOver?.(event as unknown as React.DragEvent<HTMLElement>)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('calls preventDefault when canDrop returns true', () => {
    const payload: DnDPayload = { type: 'card', data: { id: 'fire-bolt' } }
    const { dnd } = startDrag(payload)
    const onDrop = vi.fn()
    const dropProps = dnd.makeDropZone({
      accept: ['card'],
      canDrop: () => true,
      onDrop,
    })
    const event = makeDragEvent()
    dropProps.onDragOver?.(event as unknown as React.DragEvent<HTMLElement>)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('calls onDrop with payload when type matches', () => {
    const payload: DnDPayload = { type: 'card', data: { id: 'fire-bolt' } }
    const dnd = makeDnDSDK()
    const onDrop = vi.fn()
    const dropProps = dnd.makeDropZone({ accept: ['card'], onDrop })
    const event = makeDragEvent(payload)
    dropProps.onDrop?.(event as unknown as React.DragEvent<HTMLElement>)
    expect(onDrop).toHaveBeenCalledWith(payload)
  })

  it('does not call onDrop when type not in accept', () => {
    const payload: DnDPayload = { type: 'card', data: {} }
    const dnd = makeDnDSDK()
    const onDrop = vi.fn()
    const dropProps = dnd.makeDropZone({ accept: ['entity'], onDrop })
    const event = makeDragEvent(payload)
    dropProps.onDrop?.(event as unknown as React.DragEvent<HTMLElement>)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('does not call onDrop when canDrop returns false', () => {
    const payload: DnDPayload = { type: 'card', data: { id: 'shield' } }
    const dnd = makeDnDSDK()
    const onDrop = vi.fn()
    const dropProps = dnd.makeDropZone({
      accept: ['card'],
      canDrop: () => false,
      onDrop,
    })
    const event = makeDragEvent(payload)
    dropProps.onDrop?.(event as unknown as React.DragEvent<HTMLElement>)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('calls onEnter(true) when dragging acceptable payload', () => {
    const payload: DnDPayload = { type: 'card', data: { id: 'fire-bolt' } }
    const { dnd } = startDrag(payload)
    const onEnter = vi.fn()
    const dropProps = dnd.makeDropZone({
      accept: ['card'],
      canDrop: (p) => (p.data as { id: string }).id !== 'shield',
      onEnter,
      onDrop: vi.fn(),
    })
    const event = makeDragEvent()
    dropProps.onDragEnter?.(event as unknown as React.DragEvent<HTMLElement>)
    expect(onEnter).toHaveBeenCalledWith(true)
  })

  it('calls onEnter(false) when dragging rejected payload', () => {
    const payload: DnDPayload = { type: 'card', data: { id: 'shield' } }
    const { dnd } = startDrag(payload)
    const onEnter = vi.fn()
    const dropProps = dnd.makeDropZone({
      accept: ['card'],
      canDrop: (p) => (p.data as { id: string }).id !== 'shield',
      onEnter,
      onDrop: vi.fn(),
    })
    const event = makeDragEvent()
    dropProps.onDragEnter?.(event as unknown as React.DragEvent<HTMLElement>)
    expect(onEnter).toHaveBeenCalledWith(false)
  })

  it('calls onLeave when drag leaves zone', () => {
    const payload: DnDPayload = { type: 'card', data: {} }
    const { dnd } = startDrag(payload)
    const onLeave = vi.fn()
    const dropProps = dnd.makeDropZone({ accept: ['card'], onLeave, onDrop: vi.fn() })
    dropProps.onDragLeave?.(makeDragEvent() as unknown as React.DragEvent<HTMLElement>)
    expect(onLeave).toHaveBeenCalled()
  })

  it('accepts all types when accept is empty array', () => {
    const payload: DnDPayload = { type: 'anything', data: {} }
    const dnd = makeDnDSDK()
    const onDrop = vi.fn()
    const dropProps = dnd.makeDropZone({ accept: [], onDrop })
    const event = makeDragEvent(payload)
    dropProps.onDrop?.(event as unknown as React.DragEvent<HTMLElement>)
    expect(onDrop).toHaveBeenCalledWith(payload)
  })
})
