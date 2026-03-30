import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RollResultRenderer } from './RollResultRenderer'
import { registerRenderer, clearRenderers, createRendererPoint } from '../rendererRegistry'
import { _bindRollResultDeps } from './rollResultDeps'
import type { GameLogEntry } from '../../shared/logTypes'
import type { RollResultConfig, RollCardProps } from '../../rules/types'
import type { ComponentType } from 'react'

// Bind deps before tests (no circular dep in test environment)
const mockUseRulePlugin = () => ({
  diceSystem: {
    evaluateRoll: (rolls: number[][]) => {
      if (!rolls[0] || rolls[0].length < 2) return null
      if (rolls[0][0]! > rolls[0][1]!)
        return {
          type: 'daggerheart',
          hopeDie: rolls[0][0],
          fearDie: rolls[0][1],
          outcome: 'success_hope',
        }
      return {
        type: 'daggerheart',
        hopeDie: rolls[0][0],
        fearDie: rolls[0][1],
        outcome: 'success_fear',
      }
    },
    getJudgmentDisplay: () => ({ text: 'dh.success_hope', color: '#22c55e', severity: 'success' }),
  },
})

const mockUsePluginTranslation = () => ({ t: (k: string) => k })

_bindRollResultDeps(mockUseRulePlugin as any, mockUsePluginTranslation)

// Mock CardShell to just render children
vi.mock('../CardShell', () => ({
  CardShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock DiceAnimContent to render a minimal testable div
vi.mock('../../chat/DiceResultCard', () => ({
  DiceAnimContent: ({ formula, footer }: { formula: string; footer?: { text: string } }) => (
    <div data-testid="dice-anim">
      {formula}
      {footer && <span data-testid="dice-footer">{footer.text}</span>}
    </div>
  ),
}))

function makeRollEntry(
  overrides: Partial<{ payload: Record<string, unknown> }> = {},
): GameLogEntry {
  return {
    id: 'test-001',
    type: 'core:roll-result',
    origin: { seat: { id: 's1', name: 'GM', color: '#fff' } },
    timestamp: Date.now(),
    payload: {
      formula: '2d12+3',
      rolls: [[9, 3]],
      dice: [{ count: 2, sides: 12 }],
      rollType: undefined,
      ...overrides.payload,
    },
  } as GameLogEntry
}

describe('RollResultRenderer', () => {
  beforeEach(() => {
    clearRenderers()
  })

  it('renders default DiceAnimContent when no rollType', () => {
    const entry = makeRollEntry()
    render(<RollResultRenderer entry={entry} />)
    expect(screen.getByTestId('entry-roll-result')).toBeInTheDocument()
    expect(screen.getByTestId('dice-anim')).toBeInTheDocument()
    // No footer in default mode
    expect(screen.queryByTestId('dice-footer')).toBeNull()
  })

  it('renders default DiceAnimContent when rollType has no registration', () => {
    const entry = makeRollEntry({
      payload: { formula: '2d12', rolls: [[5, 3]], dice: [], rollType: 'unknown:type' },
    })
    render(<RollResultRenderer entry={entry} />)
    expect(screen.getByTestId('entry-roll-result')).toBeInTheDocument()
  })

  it('uses RollResultConfig when registered for rollType', () => {
    const point = createRendererPoint<RollResultConfig | ComponentType<RollCardProps>>(
      'rollResult',
      'test:dd',
    )
    registerRenderer(point, {
      dieConfigs: [
        { color: '#fbbf24', label: 'Hope' },
        { color: '#dc2626', label: 'Fear' },
      ],
    })
    const entry = makeRollEntry({
      payload: { formula: '2d12', rolls: [[9, 3]], dice: [], rollType: 'test:dd' },
    })
    render(<RollResultRenderer entry={entry} />)
    expect(screen.getByTestId('entry-roll-result')).toBeInTheDocument()
    // Config path evaluates judgment → footer is rendered
    expect(screen.getByTestId('dice-footer')).toBeInTheDocument()
  })

  it('uses custom component when function registered for rollType', () => {
    const CustomCard: ComponentType<RollCardProps> = ({ message }) => (
      <div data-testid="custom-card">{message.formula}</div>
    )
    const point = createRendererPoint<RollResultConfig | ComponentType<RollCardProps>>(
      'rollResult',
      'custom:roll',
    )
    registerRenderer(point, CustomCard)
    const entry = makeRollEntry({
      payload: { formula: '3d6', rolls: [[2, 4, 1]], dice: [], rollType: 'custom:roll' },
    })
    render(<RollResultRenderer entry={entry} />)
    expect(screen.getByTestId('custom-card')).toBeInTheDocument()
    expect(screen.getByTestId('custom-card')).toHaveTextContent('3d6')
  })

  it('returns null for non-roll entries', () => {
    const entry = {
      id: 'test-002',
      type: 'core:text',
      origin: { seat: { id: 's1', name: 'GM', color: '#fff' } },
      timestamp: Date.now(),
      payload: { content: 'hello' },
    } as GameLogEntry
    const { container } = render(<RollResultRenderer entry={entry} />)
    expect(container.innerHTML).toBe('')
  })
})
