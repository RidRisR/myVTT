// plugins/daggerheart/__tests__/FullCharacterSheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FullCharacterSheet } from '../ui/FullCharacterSheet'
import type { Entity } from '@myvtt/sdk'
import { DH_KEYS } from '../types'

const mockEntity: Entity = {
  id: 'e1',
  tags: [],
  components: {
    'core:identity': { name: '测试角色', imageUrl: '', color: '#3b82f6' },
    'core:token': { width: 1, height: 1 },
    'core:notes': { text: '' },
    [DH_KEYS.attributes]: {
      agility: 2,
      strength: 1,
      finesse: 0,
      instinct: 1,
      presence: 2,
      knowledge: -1,
    },
    [DH_KEYS.meta]: {
      tier: 1,
      proficiency: 3,
      className: '盗贼',
      ancestry: '人类',
    },
    // hp.current = 17 — unique value so getByDisplayValue('17') is unambiguous
    [DH_KEYS.health]: { current: 17, max: 20 },
    [DH_KEYS.stress]: { current: 1, max: 6 },
    [DH_KEYS.extras]: { hope: 2, armor: 2 },
  },
  lifecycle: 'persistent',
  permissions: { default: 'none', seats: {} },
}

describe('FullCharacterSheet', () => {
  it('renders entity name', () => {
    render(
      <FullCharacterSheet
        entity={mockEntity}
        onClose={vi.fn()}
        onUpdateEntity={vi.fn()}
        onCreateEntity={vi.fn()}
      />,
    )
    expect(screen.getByText('测试角色')).toBeTruthy()
  })

  it('calls onUpdateEntity with component patch when HP current changes', () => {
    const onUpdateEntity = vi.fn()
    render(
      <FullCharacterSheet
        entity={mockEntity}
        onClose={vi.fn()}
        onUpdateEntity={onUpdateEntity}
        onCreateEntity={vi.fn()}
      />,
    )
    // ResourceField uses an uncontrolled input (defaultValue).
    // Must fireEvent.change first to set the DOM value, then fireEvent.blur to trigger the handler.
    // hp.current = 17 is a unique value in the fixture — getByDisplayValue is unambiguous.
    const hpCurrentInput = screen.getByDisplayValue('17')
    fireEvent.change(hpCurrentInput, { target: { value: '15' } })
    fireEvent.blur(hpCurrentInput)
    // Should call with patched components
    expect(onUpdateEntity).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        components: expect.objectContaining({
          [DH_KEYS.health]: { current: 15, max: 20 },
        }),
      }),
    )
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <FullCharacterSheet
        entity={mockEntity}
        onClose={onClose}
        onUpdateEntity={vi.fn()}
        onCreateEntity={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /关闭|close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
