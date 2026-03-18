import { type ReactNode, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import { PopoverContent } from './primitives/PopoverContent'

interface ConfirmDropdownItemProps {
  /** Label shown in the dropdown menu item */
  children: ReactNode
  /** Icon displayed before the label */
  icon?: ReactNode
  /** Confirmation message shown in the popover */
  message: string
  /** Confirm button label (defaults to i18n delete_default) */
  confirmLabel?: string
  /** Cancel button label (defaults to i18n cancel_default) */
  cancelLabel?: string
  /** Called when the user confirms the action */
  onConfirm: () => void
  /** data-testid for the menu item itself */
  'data-testid'?: string
  /** Additional class on the menu item */
  className?: string
}

/**
 * A DropdownMenu.Item that, when clicked, opens a Popover confirmation bubble
 * instead of firing an action immediately.
 *
 * Encapsulates the DropdownMenu → Popover multi-primitive timing fix:
 * - requestAnimationFrame delay to skip DropdownMenu's close event sequence
 * - onPointerDownOutside/onFocusOutside prevention to block residual events
 * - Popover.Anchor wraps a real DOM <div> (not a context provider)
 */
export function ConfirmDropdownItem({
  children,
  icon,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  'data-testid': testId,
  className,
}: ConfirmDropdownItemProps) {
  const { t } = useTranslation('ui')
  const resolvedConfirmLabel = confirmLabel ?? t('delete_default')
  const resolvedCancelLabel = cancelLabel ?? t('cancel_default')

  const [popoverOpen, setPopoverOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const handleSelect = useCallback(() => {
    // Delay popover open by one animation frame to skip DropdownMenu's
    // close sequence, which would otherwise be misinterpreted as a
    // dismiss signal by the Popover.
    requestAnimationFrame(() => {
      setPopoverOpen(true)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setPopoverOpen(false)
    onConfirm()
  }, [onConfirm])

  const handleCancel = useCallback(() => {
    setPopoverOpen(false)
  }, [])

  return (
    <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
      {/* Anchor must wrap a real DOM element, not a context provider */}
      <Popover.Anchor asChild>
        <div ref={anchorRef}>
          <DropdownMenu.Item
            data-testid={testId}
            className={[
              'cursor-pointer px-3 py-1.5 text-xs text-danger outline-none',
              'flex w-full items-center gap-2',
              'transition-colors duration-fast hover:bg-hover focus:bg-hover',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            onSelect={(e) => {
              // Prevent DropdownMenu from closing — we handle it ourselves
              e.preventDefault()
              handleSelect()
            }}
          >
            {icon}
            {children}
          </DropdownMenu.Item>
        </div>
      </Popover.Anchor>

      {popoverOpen && (
        <PopoverContent
          side="top"
          align="center"
          sideOffset={8}
          // Block residual pointer/focus events from DropdownMenu close sequence
          onPointerDownOutside={(e) => { e.preventDefault(); }}
          onFocusOutside={(e) => { e.preventDefault(); }}
          onEscapeKeyDown={handleCancel}
          className="min-w-[140px]"
        >
          <p className="mb-2.5 whitespace-nowrap text-xs text-text-primary">{message}</p>
          <div className="flex justify-end gap-2">
            <button
              data-testid="confirm-cancel"
              onClick={handleCancel}
              className="cursor-pointer rounded px-2 py-1 text-[11px] text-text-muted transition-colors duration-fast hover:bg-hover"
            >
              {resolvedCancelLabel}
            </button>
            <button
              data-testid="confirm-action"
              onClick={handleConfirm}
              className="cursor-pointer rounded bg-danger px-2.5 py-1 text-[11px] text-white transition-colors duration-fast hover:bg-danger/80"
            >
              {resolvedConfirmLabel}
            </button>
          </div>
        </PopoverContent>
      )}
    </Popover.Root>
  )
}
