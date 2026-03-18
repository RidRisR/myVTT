import * as Popover from '@radix-ui/react-popover'
import { createPortal } from 'react-dom'

interface RadixContextMenuProps {
  x: number
  y: number
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

/**
 * Context menu wrapper built on Radix Popover.
 * Uses Popover.Anchor (not Trigger) to position at arbitrary {x, y} coordinates
 * — compatible with both DOM and Konva canvas events.
 *
 * The anchor is rendered via portal to document.body to avoid CSS transform
 * containment issues (e.g., parent with `-translate-x-1/2` breaking `position: fixed`).
 */
export function RadixContextMenu({ x, y, open, onClose, children }: RadixContextMenuProps) {
  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      {/* Virtual anchor: rendered to body to avoid CSS transform containment */}
      {createPortal(
        <Popover.Anchor asChild>
          <div
            style={{
              position: 'fixed',
              left: x,
              top: y,
              width: 1,
              height: 1,
              pointerEvents: 'none',
            }}
          />
        </Popover.Anchor>,
        document.body,
      )}
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={0}
          className="bg-glass backdrop-blur-[16px] rounded-lg border border-border-glass shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1 min-w-[160px] font-sans animate-[radix-popover-in_150ms_ease-out]"
          style={{ zIndex: 10001 }}
          role="menu"
          onPointerDownOutside={() => { onClose(); }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
