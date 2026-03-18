import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import * as Popover from '@radix-ui/react-popover'

type PopoverContentProps = ComponentPropsWithoutRef<typeof Popover.Content>

/**
 * Project wrapper for Radix Popover.Content.
 * Built-in protections:
 * - Portal rendering (escapes CSS containment blocks)
 * - stopPropagation on onClick/onPointerDown (prevents React synthetic event
 *   bubbling through component tree to parent click handlers)
 * - Default z-popover layer, glass styling, and entrance animation
 */
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, children, sideOffset = 4, ...props }, ref) => (
    <Popover.Portal>
      <Popover.Content
        ref={ref}
        sideOffset={sideOffset}
        className={[
          'z-popover rounded-lg border border-border-glass bg-surface px-3 py-2.5 shadow-lg shadow-black/30',
          'animate-[radix-popover-in_150ms_ease-out]',
          'will-change-[opacity,transform]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={(e) => {
          e.stopPropagation()
          props.onClick?.(e)
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          props.onPointerDown?.(e)
        }}
        {...props}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  ),
)

PopoverContent.displayName = 'PopoverContent'
