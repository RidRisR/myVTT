import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

interface DropdownMenuItemProps extends ComponentPropsWithoutRef<typeof DropdownMenu.Item> {
  variant?: 'default' | 'danger'
}

/**
 * Project wrapper for Radix DropdownMenu.Item with consistent styling.
 */
export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <DropdownMenu.Item
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

DropdownMenuItem.displayName = 'DropdownMenuItem'
