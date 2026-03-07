import { useEffect, useRef } from 'react'
import { useValue, type Editor } from 'tldraw'
import { tokenPopoverOpen } from '../roleState'
import { TokenPanel } from './TokenPanel'

interface TokenPopoverProps {
  editor: Editor
}

export function TokenPopover({ editor }: TokenPopoverProps) {
  const isOpen = useValue(tokenPopoverOpen)
  const popoverRef = useRef<HTMLDivElement>(null)

  const selectedShape = useValue('popoverShape', () => {
    const shapes = editor.getSelectedShapes()
    return shapes.length === 1 ? shapes[0] : null
  }, [editor])

  // Auto-close when selection changes to none or multi
  useEffect(() => {
    if (!selectedShape && tokenPopoverOpen.get()) {
      tokenPopoverOpen.set(false)
    }
  }, [selectedShape])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        tokenPopoverOpen.set(false)
      }
    }
    // Delay listener to avoid immediate close from the triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isOpen])

  if (!isOpen || !selectedShape) return null

  // Compute screen position from shape bounds
  const bounds = editor.getShapePageBounds(selectedShape.id)
  if (!bounds) return null

  const topRight = editor.pageToScreen({ x: bounds.maxX, y: bounds.minY })
  const topLeft = editor.pageToScreen({ x: bounds.minX, y: bounds.minY })

  const popoverWidth = 280
  const gap = 12
  const viewportWidth = window.innerWidth

  // Default: right side of shape. If overflows, flip to left.
  let left = topRight.x + gap
  if (left + popoverWidth > viewportWidth - 60) {
    left = topLeft.x - popoverWidth - gap
  }
  // Clamp to stay on screen
  left = Math.max(8, Math.min(left, viewportWidth - popoverWidth - 8))

  let top = topRight.y
  top = Math.max(8, Math.min(top, window.innerHeight - 400))

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left,
        top,
        width: popoverWidth,
        maxHeight: '70vh',
        overflowY: 'auto',
        background: '#fff',
        borderRadius: 10,
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        zIndex: 99999,
        border: '1px solid #e5e7eb',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid #f3f4f6',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'sans-serif' }}>Token Properties</span>
        <button
          onClick={() => tokenPopoverOpen.set(false)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, color: '#999', lineHeight: 1, padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>
      <TokenPanel editor={editor} />
    </div>
  )
}
