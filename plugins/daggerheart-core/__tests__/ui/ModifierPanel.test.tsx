import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { ModifierPanel } from '../../ui/ModifierPanel'

vi.mock('../../../../src/data/hooks', () => ({
  useComponent: vi.fn(),
}))

const dataHooks = await import('../../../../src/data/hooks')

describe('ModifierPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dataHooks.useComponent).mockImplementation((_actorId: string, key: string) => {
      if (key === 'daggerheart:attributes') {
        return {
          agility: 2,
          strength: 1,
          finesse: 0,
          instinct: 0,
          presence: 0,
          knowledge: 0,
        }
      }
      if (key === 'daggerheart:experiences') {
        return { items: [{ key: 'stealth', name: 'Stealth', modifier: 2 }] }
      }
      return undefined
    })
  })

  it('resolves a typed formula with empty dc and reaction roll disabled outcomes', async () => {
    const user = userEvent.setup()
    const resolve = vi.fn()

    render(
      <ModifierPanel
        context={{
          actorId: 'actor-1',
          defaultConfig: {
            dualityDice: { hopeFace: 12, fearFace: 12 },
            diceGroups: [],
            modifiers: [],
            constantModifier: 0,
            sideEffects: [],
            dc: 12,
            applyOutcomeEffects: true,
          },
        }}
        resolve={resolve}
        cancel={vi.fn()}
      />,
    )

    await user.clear(screen.getByTestId('modifier-formula-input'))
    await user.type(screen.getByTestId('modifier-formula-input'), '1d20+2')
    await user.clear(screen.getByTestId('modifier-dc-input'))
    await user.click(screen.getByTestId('modifier-reaction-toggle'))
    await user.click(screen.getByRole('button', { name: 'Roll' }))

    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        dualityDice: null,
        diceGroups: [{ sides: 20, count: 1, operator: '+', label: 'd20', keep: undefined }],
        constantModifier: 2,
        dc: undefined,
        applyOutcomeEffects: false,
      }),
    )
  })

  it('normalizes advantage and disadvantage groups to keep highest one die', async () => {
    const user = userEvent.setup()
    const resolve = vi.fn()

    render(
      <ModifierPanel
        context={{
          actorId: 'actor-1',
          defaultConfig: {
            dualityDice: { hopeFace: 12, fearFace: 12 },
            diceGroups: [
              { sides: 6, count: 2, operator: '+', label: '优势' },
              { sides: 6, count: 3, operator: '-', label: '劣势' },
            ],
            modifiers: [],
            constantModifier: 0,
            sideEffects: [],
            dc: 12,
            applyOutcomeEffects: true,
          },
        }}
        resolve={resolve}
        cancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Roll' }))

    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        diceGroups: expect.arrayContaining([
          expect.objectContaining({
            sides: 6,
            count: 2,
            operator: '+',
            keep: { mode: 'high', count: 1 },
          }),
          expect.objectContaining({
            sides: 6,
            count: 3,
            operator: '-',
            keep: { mode: 'high', count: 1 },
          }),
        ]),
      }),
    )
  })

  it('does not double count attribute modifiers when using structured selection', async () => {
    const user = userEvent.setup()
    const resolve = vi.fn()

    render(
      <ModifierPanel
        context={{
          actorId: 'actor-1',
          defaultConfig: {
            dualityDice: { hopeFace: 12, fearFace: 12 },
            diceGroups: [],
            modifiers: [],
            constantModifier: 0,
            sideEffects: [],
            dc: 12,
            applyOutcomeEffects: true,
          },
        }}
        resolve={resolve}
        cancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /敏捷/ }))
    await user.click(screen.getByRole('button', { name: 'Roll' }))

    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiers: [{ source: 'attribute:agility', label: '敏捷', value: 2 }],
        constantModifier: 0,
      }),
    )
  })

  it('applies selected experience modifiers in structured mode', async () => {
    const user = userEvent.setup()
    const resolve = vi.fn()

    render(
      <ModifierPanel
        context={{
          actorId: 'actor-1',
          defaultConfig: {
            dualityDice: { hopeFace: 12, fearFace: 12 },
            diceGroups: [],
            modifiers: [],
            constantModifier: 0,
            sideEffects: [],
            dc: 12,
            applyOutcomeEffects: true,
          },
        }}
        resolve={resolve}
        cancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Stealth/ }))
    await user.click(screen.getByRole('button', { name: 'Roll' }))

    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiers: [{ source: 'experience:stealth', label: 'Stealth', value: 2 }],
        constantModifier: 0,
      }),
    )
  })

  it('normalizes legacy experiences with empty keys before applying modifiers', async () => {
    vi.mocked(dataHooks.useComponent).mockImplementation((_actorId: string, key: string) => {
      if (key === 'daggerheart:attributes') {
        return {
          agility: 2,
          strength: 1,
          finesse: 0,
          instinct: 0,
          presence: 0,
          knowledge: 0,
        }
      }
      if (key === 'daggerheart:experiences') {
        return { items: [{ key: '', name: 'Stealth', modifier: 2 }] }
      }
      return undefined
    })

    const user = userEvent.setup()
    const resolve = vi.fn()

    render(
      <ModifierPanel
        context={{
          actorId: 'actor-1',
          defaultConfig: {
            dualityDice: { hopeFace: 12, fearFace: 12 },
            diceGroups: [],
            modifiers: [],
            constantModifier: 0,
            sideEffects: [],
            dc: 12,
            applyOutcomeEffects: true,
          },
        }}
        resolve={resolve}
        cancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Stealth/ }))
    await user.click(screen.getByRole('button', { name: 'Roll' }))

    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiers: [
          expect.objectContaining({
            source: expect.stringMatching(/^experience:/),
            label: 'Stealth',
            value: 2,
          }),
        ],
      }),
    )
  })
})
