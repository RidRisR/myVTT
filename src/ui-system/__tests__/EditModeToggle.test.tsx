// src/ui-system/__tests__/EditModeToggle.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditModeToggle } from '../EditModeToggle'
import { createLayoutStore } from '../../stores/layoutStore'

describe('EditModeToggle', () => {
  it('renders with Edit Layout text in play mode', () => {
    const store = createLayoutStore()
    render(<EditModeToggle store={store} />)
    expect(screen.getByText('Edit Layout')).toBeInTheDocument()
  })

  it('toggles to edit mode on click', () => {
    const store = createLayoutStore()
    render(<EditModeToggle store={store} />)
    fireEvent.click(screen.getByText('Edit Layout'))
    expect(store.getState().layoutMode).toBe('edit')
  })

  it('toggles back to play mode', () => {
    const store = createLayoutStore()
    store.getState().setLayoutMode('edit')
    render(<EditModeToggle store={store} />)
    fireEvent.click(screen.getByText('Lock Layout'))
    expect(store.getState().layoutMode).toBe('play')
  })
})
