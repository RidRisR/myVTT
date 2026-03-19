import { useCallback, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { PopoverContent } from '../ui/primitives/PopoverContent'
import { ContextMenuContent } from '../ui/primitives/ContextMenuContent'
import { ContextMenuItem } from '../ui/primitives/ContextMenuItem'
import { useClickOutside } from '../hooks/useClickOutside'

// ---------------------------------------------------------------------------
// Pattern: FloatingPanel + NestedOverlay
//
// Demonstrates the correct architecture for a non-modal floating panel that
// contains nested Radix overlays (Popover, ContextMenu).
//
// KEY LESSON: Do NOT use Radix Dialog for complex interactive panels.
// Dialog brings 3 hidden constraints that break nested interactions:
//   1. Portal isolation — children render outside the Dialog's DOM tree
//   2. Modal pointer-events — blocks interaction with anything outside
//   3. transform-based centering — creates a CSS containing block that
//      makes child `position: fixed` relative to Dialog, not viewport
// ---------------------------------------------------------------------------

export default function PatternFloatingPanelOverlay() {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <div className="mb-4 p-4 rounded-lg border border-border-glass bg-glass">
        <h2 className="text-sm font-medium mb-2">FloatingPanel + NestedOverlay</h2>
        <p className="text-xs text-muted leading-relaxed">
          A non-modal panel using <code className="text-accent">position: fixed + left/top</code>{' '}
          (no transform). Inside it: a Radix Popover and a ContextMenu, both rendering via Portal to
          escape the panel&apos;s DOM tree.
        </p>
        <p className="text-xs text-muted mt-2 leading-relaxed">
          Try: drag the panel, open the popover, right-click for context menu, click outside to
          close. All interactions should work without conflict.
        </p>
      </div>

      <button
        onClick={() => {
          setOpen(true)
        }}
        className="px-4 py-2 rounded-lg bg-accent text-deep text-sm font-medium cursor-pointer hover:bg-accent-bold transition-colors duration-fast"
      >
        Open Panel
      </button>

      {open && (
        <FloatingPanel
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FloatingPanel — the core of this pattern
// ---------------------------------------------------------------------------

function FloatingPanel({ onClose }: { onClose: () => void }) {
  // PATTERN: Use left/top state, NOT transform, to avoid CSS containing block.
  // If we used `transform: translate(...)` for positioning, any child with
  // `position: fixed` (like Radix Portal content) would be positioned relative
  // to this panel instead of the viewport.
  const [pos, setPos] = useState({ x: 200, y: 120 })
  const panelRef = useRef<HTMLDivElement>(null)

  // PATTERN: Radix Portal-aware click-outside. Without this, clicking on a
  // Radix Popover (which renders in a Portal outside our DOM tree) would
  // incorrectly close the panel.
  useClickOutside(panelRef, onClose, true)

  // PATTERN: Inline drag handler using pointermove/pointerup on document.
  // This avoids depending on usePanelDrag or any external drag library.
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      // Don't drag when clicking interactive elements inside the handle
      if ((e.target as HTMLElement).closest('button, input, [data-radix-popper-content-wrapper]')) {
        return
      }
      e.preventDefault()
      const startX = e.clientX - pos.x
      const startY = e.clientY - pos.y

      const onMove = (ev: PointerEvent) => {
        setPos({ x: ev.clientX - startX, y: ev.clientY - startY })
      }
      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [pos.x, pos.y],
  )

  return (
    <div
      ref={panelRef}
      // PATTERN: z-overlay (8000) for the panel itself.
      // Radix overlays inside use z-popover (5000) but render via Portal to
      // <body>, so their later DOM order ensures they appear above this panel.
      className="fixed z-overlay w-80 rounded-xl border border-border-glass bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={handleDragStart}
        className="flex items-center justify-between px-4 py-2.5 border-b border-border-glass cursor-grab active:cursor-grabbing select-none"
      >
        <span className="text-xs font-medium text-muted">Drag to move</span>
        <button
          onClick={onClose}
          className="text-muted hover:text-text-primary text-xs cursor-pointer bg-transparent border-none"
        >
          Close
        </button>
      </div>

      {/* Content area */}
      <div className="p-4 space-y-4">
        {/* Popover demo */}
        <div>
          <p className="text-xs text-muted mb-2">Popover (click to open):</p>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button className="px-3 py-1.5 rounded-md border border-border-glass bg-glass text-xs text-text-primary cursor-pointer hover:bg-hover transition-colors duration-fast">
                Open Popover
              </button>
            </Popover.Trigger>
            <PopoverContent side="right" sideOffset={8}>
              <p className="text-xs text-text-primary">
                This Popover renders via <strong>Portal</strong> to {'<body>'}.
              </p>
              <p className="text-xs text-muted mt-1">
                It escapes the panel&apos;s DOM tree, so z-index and positioning work correctly.
              </p>
            </PopoverContent>
          </Popover.Root>
        </div>

        {/* ContextMenu demo */}
        <div>
          <p className="text-xs text-muted mb-2">ContextMenu (right-click the box):</p>
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
              <div className="rounded-lg border border-dashed border-border-glass bg-glass/50 p-4 text-center">
                <span className="text-xs text-muted">Right-click here</span>
              </div>
            </ContextMenu.Trigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={() => {
                  alert('Action 1')
                }}
              >
                Action One
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  alert('Action 2')
                }}
              >
                Action Two
              </ContextMenuItem>
              <ContextMenuItem
                variant="danger"
                onSelect={() => {
                  alert('Delete')
                }}
              >
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu.Root>
        </div>

        {/* Annotation */}
        <div className="text-[10px] text-muted leading-relaxed border-t border-border-glass pt-3 space-y-1">
          <p>
            <span className="text-accent font-medium">fixed + left/top</span> — no transform, no
            containing block
          </p>
          <p>
            <span className="text-accent font-medium">useClickOutside</span> — Radix Portal-aware
            (won&apos;t close when clicking Popover/ContextMenu)
          </p>
          <p>
            <span className="text-accent font-medium">z-overlay vs z-popover</span> — panel at 8000,
            overlays at 5000 but visually on top via DOM order
          </p>
        </div>
      </div>
    </div>
  )
}
