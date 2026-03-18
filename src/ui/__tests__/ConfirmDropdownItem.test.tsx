import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Trash2 } from 'lucide-react'
import { ConfirmDropdownItem } from '../ConfirmDropdownItem'

// i18next mock — return the key itself
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

function renderInDropdown(ui: React.ReactElement) {
  return render(
    <DropdownMenu.Root defaultOpen>
      <DropdownMenu.Trigger asChild>
        <button>trigger</button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content>{ui}</DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>,
  )
}

/** Click an element and flush the rAF delay used by ConfirmDropdownItem */
async function clickAndFlush(element: HTMLElement) {
  fireEvent.click(element)
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(r))
  })
}

describe('ConfirmDropdownItem', () => {
  it('renders the menu item with label and icon', () => {
    renderInDropdown(
      <ConfirmDropdownItem
        icon={<Trash2 size={12} />}
        message="Delete this?"
        onConfirm={vi.fn()}
        data-testid="delete-item"
      >
        Delete
      </ConfirmDropdownItem>,
    )

    expect(screen.getByTestId('delete-item')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('opens confirmation popover on click', async () => {
    renderInDropdown(
      <ConfirmDropdownItem message="Are you sure?" onConfirm={vi.fn()} data-testid="delete-item">
        Delete
      </ConfirmDropdownItem>,
    )

    await clickAndFlush(screen.getByTestId('delete-item'))

    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-action')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-cancel')).toBeInTheDocument()
  })

  it('fires onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    renderInDropdown(
      <ConfirmDropdownItem message="Delete?" onConfirm={onConfirm} data-testid="delete-item">
        Delete
      </ConfirmDropdownItem>,
    )

    await clickAndFlush(screen.getByTestId('delete-item'))
    fireEvent.click(screen.getByTestId('confirm-action'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('closes popover on cancel click without firing onConfirm', async () => {
    const onConfirm = vi.fn()
    renderInDropdown(
      <ConfirmDropdownItem message="Delete?" onConfirm={onConfirm} data-testid="delete-item">
        Delete
      </ConfirmDropdownItem>,
    )

    await clickAndFlush(screen.getByTestId('delete-item'))
    fireEvent.click(screen.getByTestId('confirm-cancel'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument()
  })

  it('closes popover on Escape key', async () => {
    renderInDropdown(
      <ConfirmDropdownItem message="Delete?" onConfirm={vi.fn()} data-testid="delete-item">
        Delete
      </ConfirmDropdownItem>,
    )

    await clickAndFlush(screen.getByTestId('delete-item'))
    expect(screen.getByText('Delete?')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument()
  })

  it('uses custom confirm and cancel labels', async () => {
    renderInDropdown(
      <ConfirmDropdownItem
        message="Remove?"
        confirmLabel="Yes, remove"
        cancelLabel="No, keep"
        onConfirm={vi.fn()}
        data-testid="delete-item"
      >
        Remove
      </ConfirmDropdownItem>,
    )

    await clickAndFlush(screen.getByTestId('delete-item'))

    expect(screen.getByText('Yes, remove')).toBeInTheDocument()
    expect(screen.getByText('No, keep')).toBeInTheDocument()
  })

  it('preserves data-testid on the confirm button', async () => {
    renderInDropdown(
      <ConfirmDropdownItem message="Delete?" onConfirm={vi.fn()} data-testid="delete-item">
        Delete
      </ConfirmDropdownItem>,
    )

    await clickAndFlush(screen.getByTestId('delete-item'))

    const confirmBtn = screen.getByTestId('confirm-action')
    expect(confirmBtn).toBeInTheDocument()
    expect(confirmBtn.tagName).toBe('BUTTON')
  })
})
