import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

type DialogContentProps = ComponentPropsWithoutRef<typeof Dialog.Content> & {
  /** When true, render without the dark backdrop overlay */
  noOverlay?: boolean
}

/**
 * Project wrapper for Radix Dialog.Content.
 * Built-in protections:
 * - Portal rendering (escapes CSS containment blocks)
 * - Overlay with backdrop blur (unless noOverlay)
 * - stopPropagation on onPointerDown (prevents bubbling to canvas)
 * - Default z-modal layer and entrance animation
 * - Focus trap and ARIA role="dialog"
 *
 * Centering uses flexbox (no CSS transform) to avoid creating a
 * containing block that breaks position:fixed inside (@dnd-kit, etc.).
 */
export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, noOverlay, style, onPointerDown, ...props }, ref) => (
    <Dialog.Portal>
      {!noOverlay && (
        <Dialog.Overlay className="fixed inset-0 z-modal bg-black/70 animate-[radix-popover-in_150ms_ease-out]" />
      )}
      <Dialog.Content
        aria-describedby={undefined}
        className="fixed inset-0 z-modal outline-none flex items-center justify-center pointer-events-none"
        {...props}
      >
        <div
          ref={ref}
          className={[
            'pointer-events-auto animate-[radix-popover-in_150ms_ease-out]',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          style={style}
          onPointerDown={(e) => {
            e.stopPropagation()
            onPointerDown?.(e)
          }}
        >
          {children}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  ),
)

DialogContent.displayName = 'DialogContent'
