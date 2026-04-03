import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RollResultRenderer } from './RollResultRenderer'
import { registerRenderer, clearRenderers, createRendererPoint } from '../rendererRegistry'
import type { GameLogEntry } from '../../shared/logTypes'
import type { RollResultConfig, RollCardProps } from '../../rules/types'
import type { ComponentType } from 'react'

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
    seq: 0,
    id: 'test-001',
    type: 'core:roll-result',
    origin: { seat: { id: 's1', name: 'GM', color: '#fff' } },
    executor: 's1',
    groupId: 'g1',
    chainDepth: 0,
    triggerable: true,
    visibility: {},
    baseSeq: 0,
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
    expect(screen.getByTestId('entry-roll-result')).toBeDefined()
    expect(screen.getByTestId('dice-anim')).toBeDefined()
    // No footer in default mode
    expect(screen.queryByTestId('dice-footer')).toBeNull()
  })

  it('renders default DiceAnimContent when rollType has no registration', () => {
    const entry = makeRollEntry({
      payload: { formula: '2d12', rolls: [[5, 3]], dice: [], rollType: 'unknown:type' },
    })
    render(<RollResultRenderer entry={entry} />)
    expect(screen.getByTestId('entry-roll-result')).toBeDefined()
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
    expect(screen.getByTestId('entry-roll-result')).toBeDefined()
    // Semantic config path renders dieConfigs only — no judgment footer
    expect(screen.queryByTestId('dice-footer')).toBeNull()
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
    expect(screen.getByTestId('custom-card')).toBeDefined()
    expect(screen.getByTestId('custom-card').textContent).toBe('3d6')
  })

  it('returns null for non-roll entries', () => {
    const entry = makeRollEntry()
    // Override type to non-roll
    ;(entry as unknown as Record<string, unknown>).type = 'core:text'
    ;(entry as unknown as Record<string, unknown>).payload = { content: 'hello' }
    const { container } = render(<RollResultRenderer entry={entry} />)
    expect(container.innerHTML).toBe('')
  })
})
