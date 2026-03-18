// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ConfirmDropdown } from '../ConfirmDropdownItem'

// Radix uses ResizeObserver internally — jsdom doesn't provide it
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Radix uses DOMRect — jsdom returns zeros, need a valid rect for positioning
if (!Element.prototype.getBoundingClientRect) {
  Element.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 100, height: 30, top: 0, right: 100, bottom: 30, left: 0, toJSON: () => {} }) as DOMRect
}

function renderDropdown(onConfirm = vi.fn()) {
  const user = userEvent.setup()
  render(
    <ConfirmDropdown
      trigger={<button>Menu</button>}
      confirmLabel="Delete"
      confirmMessage="Are you sure?"
      onConfirm={onConfirm}
      confirmItemClassName="confirm-item"
    >
      <DropdownMenu.Item onSelect={vi.fn()}>Rename</DropdownMenu.Item>
    </ConfirmDropdown>,
  )
  return { user, onConfirm }
}

describe('ConfirmDropdown', () => {
  it('opens the dropdown menu when trigger is clicked', async () => {
    const { user } = renderDropdown()

    await user.click(screen.getByRole('button', { name: 'Menu' }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Rename')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('shows confirm popover after clicking the confirm item', async () => {
    const { user } = renderDropdown()

    // Open menu
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    // Click the confirm item (Delete)
    await user.click(screen.getByText('Delete'))

    // rAF delay — flush it
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r))
    })

    await waitFor(() => {
      expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    })
  })

  it('closes confirm popover when Cancel is clicked', async () => {
    const { user } = renderDropdown()

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByText('Delete'))

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r))
    })

    await waitFor(() => {
      expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument()
    })
  })

  it('calls onConfirm and closes when Delete is confirmed', async () => {
    const onConfirm = vi.fn()
    const { user } = renderDropdown(onConfirm)

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByText('Delete'))

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r))
    })

    await waitFor(() => {
      expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    })

    // The confirm button inside the popover also says "Delete"
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' })
    const popoverDelete = confirmButtons.find(
      (btn) => btn.closest('[data-radix-popper-content-wrapper]') != null,
    ) ?? confirmButtons[confirmButtons.length - 1]

    await user.click(popoverDelete)

    expect(onConfirm).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument()
    })
  })

  it('anchors confirm popover to a real DOM node (not a context provider)', async () => {
    const { user } = renderDropdown()

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByText('Delete'))

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r))
    })

    await waitFor(() => {
      expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    })

    // The popover content should be inside a Radix popper wrapper,
    // proving it was positioned by a valid anchor (not null)
    const popoverContent = screen.getByText('Are you sure?').closest('[data-radix-popper-content-wrapper]')
    expect(popoverContent).toBeInTheDocument()
  })

  it('does not call onConfirm when Cancel is clicked', async () => {
    const onConfirm = vi.fn()
    const { user } = renderDropdown(onConfirm)

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByText('Delete'))

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r))
    })

    await waitFor(() => {
      expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('closes confirm popover on Escape key', async () => {
    const { user } = renderDropdown()

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByText('Delete'))

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r))
    })

    await waitFor(() => {
      expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument()
    })
  })
})
