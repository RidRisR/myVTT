import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { IRegionSDK } from '../../../../src/ui-system/types'

const mockRunWorkflow = vi.fn().mockResolvedValue({ status: 'completed' })
const mockResize = vi.fn()

vi.mock('../../../../src/stores/identityStore', () => ({
  useIdentityStore: vi.fn(),
}))

const identityModule = await import('../../../../src/stores/identityStore')
import { PlayerBottomPanel } from '../../ui/PlayerBottomPanel'

function makeMockSdk(overrides: Partial<{ role: 'GM' | 'Player' }> = {}) {
  return {
    data: {
      useComponent: vi.fn().mockImplementation((_id: string, key: string) => {
        if (key === 'daggerheart:health') return { current: 15, max: 20 }
        if (key === 'daggerheart:stress') return { current: 2, max: 6 }
        if (key === 'daggerheart:extras') return { hope: 3, hopeMax: 6, armor: 2, armorMax: 4 }
        if (key === 'daggerheart:attributes') {
          return {
            agility: 2,
            strength: -1,
            finesse: 0,
            instinct: 3,
            presence: 1,
            knowledge: -2,
          }
        }
        if (key === 'daggerheart:experiences') {
          return { items: [{ key: 'forest-survival', name: '森林生存专家', modifier: 2 }] }
        }
        if (key === 'daggerheart:roll-templates') {
          return {
            items: [
              {
                id: 'tmpl-stealth',
                name: '潜行检定',
                icon: 'stealth',
                createdAt: 1,
                updatedAt: 1,
                config: {
                  dualityDice: { hopeFace: 12, fearFace: 12 },
                  diceGroups: [],
                  modifiers: [
                    { type: 'attribute', attributeKey: 'agility' },
                    { type: 'experience', experienceKey: 'forest-survival' },
                  ],
                  constantModifier: 0,
                  sideEffects: [],
                },
              },
            ],
          }
        }
        return undefined
      }),
      useEntity: vi.fn(),
      useQuery: vi.fn().mockReturnValue([]),
    },
    workflow: { runWorkflow: mockRunWorkflow },
    context: { instanceProps: {}, role: overrides.role ?? 'Player', layoutMode: 'play' },
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

function setupIdentityStore(activeCharacterId: string | null = 'char1') {
  vi.mocked(identityModule.useIdentityStore).mockImplementation((selector) => {
    const state = {
      seats: [
        {
          id: 'seat1',
          name: 'Player1',
          color: '#3b82f6',
          role: 'PL' as const,
          activeCharacterId: activeCharacterId ?? undefined,
        },
      ],
      mySeatId: 'seat1',
      onlineSeatIds: new Set<string>(),
      _socket: null,
      _roomId: null,
      getMySeat: () => null,
      init: vi.fn(),
      claimSeat: vi.fn(),
      createSeat: vi.fn(),
      leaveSeat: vi.fn(),
      deleteSeat: vi.fn(),
      updateSeat: vi.fn(),
      _reset: vi.fn(),
    } as Parameters<typeof selector>[0]
    return selector(state)
  })
}

/** Hover into the panel to trigger expand after debounce */
async function hoverExpand(container: HTMLElement) {
  fireEvent.mouseEnter(container)
  await act(() => vi.advanceTimersByTimeAsync(250))
}

describe('PlayerBottomPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setupIdentityStore('char1')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders collapsed bar as pure display for players by default', () => {
    render(<PlayerBottomPanel sdk={makeMockSdk()} />)
    expect(screen.getByTestId('player-bottom-panel-collapsed')).toBeInTheDocument()
    expect(mockResize).toHaveBeenLastCalledWith({ width: 480, height: 48 })
    // Collapsed bar shows resource values only (no buttons)
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('/20')).toBeInTheDocument()
  })

  it('expands on mouse enter and collapses on mouse leave', async () => {
    const { container } = render(<PlayerBottomPanel sdk={makeMockSdk()} />)
    const root = container.firstElementChild as HTMLElement

    await hoverExpand(root)
    expect(screen.getByTestId('player-bottom-panel-expanded')).toBeInTheDocument()
    expect(mockResize).toHaveBeenLastCalledWith({ width: 480, height: 220 })

    fireEvent.mouseLeave(root)
    await act(() => vi.advanceTimersByTimeAsync(350))
    expect(screen.getByTestId('player-bottom-panel-collapsed')).toBeInTheDocument()
    expect(mockResize).toHaveBeenLastCalledWith({ width: 480, height: 48 })
  })

  it('attribute tab cards trigger unified action-check workflow', async () => {
    const { container } = render(<PlayerBottomPanel sdk={makeMockSdk()} />)
    await hoverExpand(container.firstElementChild as HTMLElement)

    fireEvent.click(screen.getByText('敏捷'))
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:action-check' }),
      expect.objectContaining({
        actorId: 'char1',
        preselectedAttribute: 'agility',
        skipModifier: false,
      }),
    )
  })

  it('gm role stays hidden', () => {
    render(<PlayerBottomPanel sdk={makeMockSdk({ role: 'GM' })} />)
    expect(screen.getByTestId('player-bottom-panel-hidden')).toBeInTheDocument()
  })

  it('custom tab can trigger stored templates directly', async () => {
    const { container } = render(<PlayerBottomPanel sdk={makeMockSdk()} />)
    await hoverExpand(container.firstElementChild as HTMLElement)

    fireEvent.click(screen.getByText('自定义'))
    fireEvent.click(screen.getByText('潜行检定'))
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:action-check' }),
      expect.objectContaining({
        actorId: 'char1',
        rollTemplateId: 'tmpl-stealth',
        skipModifier: true,
      }),
    )
  })
})
