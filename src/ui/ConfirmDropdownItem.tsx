import { type ReactNode, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

interface ConfirmDropdownProps {
  /** The trigger element (e.g. ⋮ button) — rendered as DropdownMenu.Trigger */
  trigger: ReactNode
  /** Normal dropdown items (DropdownMenu.Item, Separator, etc.) */
  children: ReactNode
  /** Label inside the confirm-triggering menu item */
  confirmLabel: ReactNode
  /** Confirmation prompt shown in the popover */
  confirmMessage: string
  /** Called when user clicks "Delete" in the confirm popover */
  onConfirm: () => void
  /** ClassName for the confirm menu item (e.g. text-danger) */
  confirmItemClassName?: string
  /** DropdownMenu.Content align — default "end" */
  align?: 'start' | 'center' | 'end'
}

/**
 * A DropdownMenu where one item requires a second click to confirm via Popover.
 *
 * Handles the Radix multi-primitive timing conflict:
 * - DropdownMenu's close sequence dispatches pointer/focus events
 * - A freshly-opened Popover would interpret them as dismiss signals
 *
 * Fix (baked in):
 * 1. requestAnimationFrame delays Popover open past DropdownMenu teardown
 * 2. onPointerDownOutside / onFocusOutside are blocked on Popover.Content
 */
export function ConfirmDropdown({
  trigger,
  children,
  confirmLabel,
  confirmMessage,
  onConfirm,
  confirmItemClassName,
  align = 'end',
}: ConfirmDropdownProps) {
  const [confirming, setConfirming] = useState(false)

  return (
    <Popover.Root
      open={confirming}
      onOpenChange={(v) => {
        if (!v) setConfirming(false)
      }}
    >
      <Popover.Anchor asChild>
        <div>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align={align}
                sideOffset={4}
                className="z-popover bg-surface border border-border-glass rounded-md shadow-lg py-1 min-w-[120px] font-sans animate-[radix-popover-in_150ms_ease-out]"
                onClick={(e) => {
                  e.stopPropagation()
                }}
              >
                {children}
                <DropdownMenu.Separator className="border-t border-border-glass my-1" />
                <DropdownMenu.Item
                  onSelect={() => {
                    requestAnimationFrame(() => {
                      setConfirming(true)
                    })
                  }}
                  className={confirmItemClassName}
                >
                  {confirmLabel}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          onPointerDownOutside={(e) => {
            e.preventDefault()
          }}
          onFocusOutside={(e) => {
            e.preventDefault()
          }}
          className="bg-surface border border-border-glass rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] px-3 py-2.5 min-w-[140px] z-popover font-sans animate-[radix-popover-in_150ms_ease-out]"
        >
          <p className="text-xs text-text-primary mb-2.5 whitespace-nowrap">
            {confirmMessage}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setConfirming(false)
              }}
              className="text-[11px] text-text-muted px-2 py-1 rounded hover:bg-hover cursor-pointer transition-colors duration-fast"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirming(false)
                onConfirm()
              }}
              className="text-[11px] text-white bg-danger px-2.5 py-1 rounded hover:bg-danger/80 cursor-pointer transition-colors duration-fast"
            >
              Delete
            </button>
          </div>
          <Popover.Arrow
            className="fill-[rgb(var(--color-surface))]"
            width={12}
            height={6}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
