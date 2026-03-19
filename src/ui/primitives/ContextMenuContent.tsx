import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'

type ContextMenuContentProps = ComponentPropsWithoutRef<typeof ContextMenu.Content>

/**
 * Project wrapper for Radix ContextMenu.Content.
 * Applies consistent glass styling and entrance animation.
 */
export const ContextMenuContent = forwardRef<HTMLDivElement, ContextMenuContentProps>(
  ({ className, children, ...props }, ref) => (
    <ContextMenu.Portal>
      <ContextMenu.Content
        ref={ref}
        className={[
          'z-context min-w-[160px] rounded-lg border border-border-glass bg-glass py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-[16px]',
          'animate-[radix-popover-in_150ms_ease-out]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  ),
)

ContextMenuContent.displayName = 'ContextMenuContent'
