import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

type DropdownMenuContentProps = ComponentPropsWithoutRef<typeof DropdownMenu.Content>

/**
 * Project wrapper for Radix DropdownMenu.Content.
 * Applies consistent glass styling and entrance animation.
 */
export const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, children, sideOffset = 4, ...props }, ref) => (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        className={[
          'z-popover min-w-[160px] rounded-lg border border-border-glass bg-glass py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-[16px]',
          'animate-[radix-popover-in_150ms_ease-out]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  ),
)

DropdownMenuContent.displayName = 'DropdownMenuContent'
