// src/ui-system/__tests__/InputHandlerHost.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { InputHandlerHost } from '../InputHandlerHost'
import { UIRegistry } from '../registry'
import { useSessionStore, requestInput } from '../../stores/sessionStore'
import type { InputHandlerProps } from '../inputHandlerTypes'

// A simple test handler that renders a button to resolve
function TestHandler({ context, resolve, cancel }: InputHandlerProps<{ label: string }, string>) {
  return (
    <div data-testid="test-handler">
      <span>{(context as { label: string }).label}</span>
      <button
        onClick={() => {
          resolve('picked')
        }}
      >
        Pick
      </button>
      <button
        onClick={() => {
          cancel()
        }}
      >
        Cancel
      </button>
    </div>
  )
}

describe('InputHandlerHost', () => {
  let registry: UIRegistry

  beforeEach(() => {
    registry = new UIRegistry()
    useSessionStore.setState({ selection: [], pendingInteractions: new Map() })
  })

  it('renders nothing when no pending interactions', () => {
    const { container } = render(<InputHandlerHost registry={registry} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders registered handler when interaction is pending', () => {
    registry.registerInputHandler('test:choice', { component: TestHandler as never })

    render(<InputHandlerHost registry={registry} />)

    act(() => {
      void requestInput('test:choice', { context: { label: 'Choose one' } })
    })

    expect(screen.getByTestId('test-handler')).toBeDefined()
    expect(screen.getByText('Choose one')).toBeDefined()
  })

  it('unmounts handler after resolve', () => {
    registry.registerInputHandler('test:choice', { component: TestHandler as never })

    render(<InputHandlerHost registry={registry} />)

    act(() => {
      void requestInput('test:choice', { context: { label: 'Pick' } })
    })

    expect(screen.getByTestId('test-handler')).toBeDefined()

    act(() => {
      screen.getByRole('button', { name: 'Pick' }).click()
    })

    expect(screen.queryByTestId('test-handler')).toBeNull()
  })

  it('unmounts handler after cancel', () => {
    registry.registerInputHandler('test:choice', { component: TestHandler as never })

    render(<InputHandlerHost registry={registry} />)

    act(() => {
      void requestInput('test:choice', { context: { label: 'Pick' } })
    })

    act(() => {
      screen.getByText('Cancel').click()
    })

    expect(screen.queryByTestId('test-handler')).toBeNull()
  })

  it('does not render handler if inputType has no registered handler', () => {
    render(<InputHandlerHost registry={registry} />)

    act(() => {
      void requestInput('unregistered:type')
    })

    expect(screen.queryByTestId('test-handler')).toBeNull()
  })
})
