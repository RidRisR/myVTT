import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'

interface ContextMenuItemProps extends ComponentPropsWithoutRef<typeof ContextMenu.Item> {
  variant?: 'default' | 'danger'
}

/**
 * Project wrapper for Radix ContextMenu.Item with consistent styling.
 */
export const ContextMenuItem = forwardRef<HTMLDivElement, ContextMenuItemProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <ContextMenu.Item
      ref={ref}
      className={[
        'cursor-pointer px-3.5 py-2 text-xs font-medium outline-none',
        'transition-colors duration-fast',
        variant === 'danger'
          ? 'text-danger hover:bg-hover focus:bg-hover'
          : 'text-text-primary hover:bg-hover focus:bg-hover',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  ),
)

ContextMenuItem.displayName = 'ContextMenuItem'
