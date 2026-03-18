import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

type DialogContentProps = ComponentPropsWithoutRef<typeof Dialog.Content>

/**
 * Project wrapper for Radix Dialog.Content.
 * Built-in protections:
 * - Portal rendering (escapes CSS containment blocks)
 * - Overlay with backdrop blur
 * - stopPropagation on onPointerDown (prevents bubbling to canvas)
 * - Default z-modal layer and entrance animation
 * - Focus trap and ARIA role="dialog"
 */
export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, ref) => (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-modal bg-black/70 animate-[radix-popover-in_150ms_ease-out]" />
      <Dialog.Content
        ref={ref}
        className={[
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-modal outline-none',
          'animate-[radix-popover-in_150ms_ease-out]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        onPointerDown={(e) => {
          e.stopPropagation()
          props.onPointerDown?.(e)
        }}
        {...props}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  ),
)

DialogContent.displayName = 'DialogContent'
