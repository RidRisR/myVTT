import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { IRegionSDK } from '../../../../src/ui-system/types'
import type { Entity } from '../../../../src/shared/entityTypes'
import { BattleOverviewPanel } from '../../ui/BattleOverviewPanel'

// ── Test data ──

function makeEntity(id: string, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    permissions: { default: 'observer', seats: {} },
    lifecycle: 'persistent',
    tags: [],
    components: {
      'core:identity': { name: `Entity-${id}`, imageUrl: '', color: '#888' },
    },
    ...overrides,
  }
}

function makePCEntity(id: string, name: string, seatId: string): Entity {
  return makeEntity(id, {
    permissions: { default: 'observer', seats: { [seatId]: 'owner' } },
    components: {
      'core:identity': { name, imageUrl: '', color: '#3b82f6' },
      'daggerheart:health': { current: 15, max: 20 },
      'daggerheart:stress': { current: 2, max: 6 },
      'daggerheart:extras': { hope: 4, hopeMax: 6, armor: 3, armorMax: 5 },
      'daggerheart:meta': { tier: 1, proficiency: 2, className: 'Guardian', ancestry: 'Human' },
    },
  })
}

function makeNPCEntity(id: string, name: string): Entity {
  return makeEntity(id, {
    permissions: { default: 'observer', seats: {} },
    components: {
      'core:identity': { name, imageUrl: '', color: '#666' },
      'daggerheart:health': { current: 8, max: 16 },
      'daggerheart:stress': { current: 4, max: 6 },
      'daggerheart:meta': { tier: 1, proficiency: 0, className: '', ancestry: '' },
    },
  })
}

// ── Mock SDK ──

const mockResize = vi.fn()

function makeMockSdk(entities: Entity[] = []) {
  return {
    data: {
      useComponent: vi.fn().mockImplementation((entityId: string, key: string) => {
        const entity = entities.find((e) => e.id === entityId)
        return entity?.components[key]
      }),
      useEntity: vi.fn().mockImplementation((entityId: string) => {
        return entities.find((e) => e.id === entityId)
      }),
      useQuery: vi.fn().mockReturnValue(entities),
    },
    workflow: { runWorkflow: vi.fn().mockResolvedValue({ status: 'completed' }) },
    context: { instanceProps: {}, role: 'Player', layoutMode: 'play' },
    read: {},
    interaction: undefined,
    awareness: {
      subscribe: () => () => {},
      broadcast: () => {},
      clear: () => {},
      usePeers: () => new Map(),
    },
    log: {
      subscribe: () => () => {},
      useEntries: () => ({ entries: [], newIds: new Set() }),
    },
    ui: {
      openPanel: vi.fn(),
      closePanel: vi.fn(),
      resize: mockResize,
      getPortalContainer: () => document.body,
    },
  } as unknown as IRegionSDK
}

// ── Tests ──

describe('BattleOverviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders tab bar with three tabs', () => {
    render(<BattleOverviewPanel sdk={makeMockSdk()} />)
    expect(screen.getByTestId('tab-all')).toBeInTheDocument()
    expect(screen.getByTestId('tab-ally')).toBeInTheDocument()
    expect(screen.getByTestId('tab-enemy')).toBeInTheDocument()
  })

  it('shows empty state when no entities', () => {
    render(<BattleOverviewPanel sdk={makeMockSdk()} />)
    expect(screen.getByTestId('empty-state')).toHaveTextContent('暂无在场单位')
  })

  it('shows ally rows with 4 stats (HP, Stress, Armor, Hope)', () => {
    const pc = makePCEntity('pc1', 'Kael', 'seat1')
    render(<BattleOverviewPanel sdk={makeMockSdk([pc])} />)

    expect(screen.getByTestId('unit-row-ally')).toBeInTheDocument()
    expect(screen.getByText('Kael')).toBeInTheDocument()
    expect(screen.getByText('Guardian')).toBeInTheDocument()

    // Should show all 4 stat values
    const stats = screen.getByTestId('unit-stats')
    expect(stats).toHaveTextContent('15') // HP
    expect(stats).toHaveTextContent('2') // Stress
    expect(stats).toHaveTextContent('3') // Armor
    expect(stats).toHaveTextContent('4') // Hope
  })

  it('shows enemy rows with only 2 stats (HP, Stress) and enemy badge', () => {
    const npc = makeNPCEntity('npc1', '暗影狼')
    render(<BattleOverviewPanel sdk={makeMockSdk([npc])} />)

    expect(screen.getByTestId('unit-row-enemy')).toBeInTheDocument()
    expect(screen.getByText('暗影狼')).toBeInTheDocument()
    expect(screen.getByTestId('enemy-badge')).toHaveTextContent('敌')

    // Should only have HP and Stress, not Armor and Hope
    const stats = screen.getByTestId('unit-stats')
    expect(stats).toHaveTextContent('8') // HP
    expect(stats).toHaveTextContent('4') // Stress
    // No shield or diamond icons should be rendered (enemy has no extras)
    expect(stats.querySelectorAll('svg').length).toBe(2)
  })

  it('"全部" tab shows allies on top, divider, then enemies', () => {
    const pc = makePCEntity('pc1', 'Kael', 'seat1')
    const npc = makeNPCEntity('npc1', '暗影狼')
    render(<BattleOverviewPanel sdk={makeMockSdk([pc, npc])} />)

    expect(screen.getByTestId('unit-row-ally')).toBeInTheDocument()
    expect(screen.getByTestId('section-divider')).toBeInTheDocument()
    expect(screen.getByTestId('unit-row-enemy')).toBeInTheDocument()

    // Verify ordering: ally before divider before enemy
    const list = screen.getByTestId('unit-list')
    const children = Array.from(list.children)
    const allyIdx = children.findIndex((el) => el.getAttribute('data-testid') === 'unit-row-ally')
    const dividerIdx = children.findIndex(
      (el) => el.getAttribute('data-testid') === 'section-divider',
    )
    const enemyIdx = children.findIndex((el) => el.getAttribute('data-testid') === 'unit-row-enemy')
    expect(allyIdx).toBeLessThan(dividerIdx)
    expect(dividerIdx).toBeLessThan(enemyIdx)
  })

  it('switching to "我方" tab shows only allies', () => {
    const pc = makePCEntity('pc1', 'Kael', 'seat1')
    const npc = makeNPCEntity('npc1', '暗影狼')
    render(<BattleOverviewPanel sdk={makeMockSdk([pc, npc])} />)

    fireEvent.click(screen.getByTestId('tab-ally'))

    expect(screen.getByTestId('unit-row-ally')).toBeInTheDocument()
    expect(screen.queryByTestId('unit-row-enemy')).not.toBeInTheDocument()
    expect(screen.queryByTestId('section-divider')).not.toBeInTheDocument()
  })

  it('switching to "敌方" tab shows only enemies', () => {
    const pc = makePCEntity('pc1', 'Kael', 'seat1')
    const npc = makeNPCEntity('npc1', '暗影狼')
    render(<BattleOverviewPanel sdk={makeMockSdk([pc, npc])} />)

    fireEvent.click(screen.getByTestId('tab-enemy'))

    expect(screen.queryByTestId('unit-row-ally')).not.toBeInTheDocument()
    expect(screen.getByTestId('unit-row-enemy')).toBeInTheDocument()
    expect(screen.queryByTestId('section-divider')).not.toBeInTheDocument()
  })

  it('shows tab-specific empty state for ally tab', () => {
    const npc = makeNPCEntity('npc1', '暗影狼')
    render(<BattleOverviewPanel sdk={makeMockSdk([npc])} />)

    fireEvent.click(screen.getByTestId('tab-ally'))
    expect(screen.getByTestId('empty-state')).toHaveTextContent('暂无我方单位')
  })

  it('shows tab-specific empty state for enemy tab', () => {
    const pc = makePCEntity('pc1', 'Kael', 'seat1')
    render(<BattleOverviewPanel sdk={makeMockSdk([pc])} />)

    fireEvent.click(screen.getByTestId('tab-enemy'))
    expect(screen.getByTestId('empty-state')).toHaveTextContent('暂无敌方单位')
  })

  it('calls resize based on entity count', () => {
    const pc = makePCEntity('pc1', 'Kael', 'seat1')
    const npc = makeNPCEntity('npc1', '暗影狼')
    render(<BattleOverviewPanel sdk={makeMockSdk([pc, npc])} />)

    // TAB_BAR_HEIGHT(40) + 2 units * ROW_HEIGHT(52) + DIVIDER_HEIGHT(28) + PADDING_Y(20) = 192
    expect(mockResize).toHaveBeenCalledWith({ width: 480, height: 192 })
  })

  it('clamps resize height to MAX_HEIGHT for many entities', () => {
    const entities: Entity[] = []
    for (let i = 0; i < 15; i++) {
      entities.push(makePCEntity(`pc${i}`, `Hero${i}`, `seat${i}`))
    }
    render(<BattleOverviewPanel sdk={makeMockSdk(entities)} />)

    // 15 * 52 + 40 + 20 = 840 → clamped to 480
    expect(mockResize).toHaveBeenCalledWith({ width: 480, height: 480 })
  })

  it('prefers imageUrl for avatar when available', () => {
    const pc = makeEntity('pc-img', {
      permissions: { default: 'observer', seats: { s1: 'owner' } },
      components: {
        'core:identity': { name: 'Lyra', imageUrl: '/avatars/lyra.png', color: '#3b82f6' },
        'daggerheart:health': { current: 10, max: 10 },
        'daggerheart:stress': { current: 0, max: 6 },
      },
    })
    render(<BattleOverviewPanel sdk={makeMockSdk([pc])} />)

    const img = screen.getByRole('presentation')
    expect(img).toHaveAttribute('src', '/avatars/lyra.png')
  })

  it('falls back to initial letter when no imageUrl', () => {
    const pc = makePCEntity('pc1', 'Kael', 'seat1')
    render(<BattleOverviewPanel sdk={makeMockSdk([pc])} />)

    // No img tag should exist
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    // Should show initial 'K'
    expect(screen.getByText('K')).toBeInTheDocument()
  })

  it('does not show divider when only allies in "全部" tab', () => {
    const pc = makePCEntity('pc1', 'Kael', 'seat1')
    render(<BattleOverviewPanel sdk={makeMockSdk([pc])} />)

    expect(screen.queryByTestId('section-divider')).not.toBeInTheDocument()
  })
})
