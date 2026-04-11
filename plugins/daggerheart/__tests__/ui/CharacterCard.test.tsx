import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import type { IRegionSDK } from '../../../../src/ui-system/types'
import type { Entity } from '../../../../src/shared/entityTypes'

const mockRunWorkflow = vi.fn().mockResolvedValue({ status: 'completed' })
const mockResize = vi.fn()

// Mock useIdentityStore
vi.mock('../../../../src/stores/identityStore', () => ({
  useIdentityStore: vi.fn(),
}))

// Mock @myvtt/sdk
vi.mock('@myvtt/sdk', () => ({
  usePluginTranslation: vi.fn().mockReturnValue({
    t: (key: string) => {
      const map: Record<string, string> = {
        'charcard.noCharacter': 'No character selected',
        'charcard.section.attributes': 'Attributes',
        'charcard.section.resources': 'Resources',
        'charcard.section.thresholds': 'Thresholds',
        'charcard.section.experiences': 'Experiences',
        'charcard.res.hp': 'HP',
        'charcard.res.stress': 'Stress',
        'charcard.res.armor': 'Armor',
        'charcard.res.hope': 'Hope',
        'charcard.threshold.evasion': '闪避',
        'charcard.threshold.major': '重伤',
        'charcard.threshold.severe': '严重',
        'attr.agility': '敏捷',
        'attr.strength': '力量',
        'attr.instinct': '本能',
        'attr.knowledge': '知识',
        'attr.presence': '临场',
        'attr.finesse': '精巧',
      }
      return map[key] ?? key
    },
  }),
}))

// Import after mock
const identityModule = await import('../../../../src/stores/identityStore')
import { CharacterCard } from '../../ui/CharacterCard'

const TEST_ENTITY: Entity = {
  id: 'char1',
  permissions: { default: 'owner', seats: {} },
  lifecycle: 'persistent',
  tags: [],
  components: {
    'core:identity': { name: 'Aria', imageUrl: '', color: '#ff0000' },
    'daggerheart:attributes': {
      agility: 2,
      strength: -1,
      finesse: 0,
      instinct: 3,
      presence: 1,
      knowledge: -2,
    },
    'daggerheart:meta': { tier: 2, proficiency: 2, className: 'Bard', ancestry: 'Elf' },
    'daggerheart:health': { current: 15, max: 20 },
    'daggerheart:stress': { current: 2, max: 6 },
    'daggerheart:extras': { hope: 3, hopeMax: 6, armor: 2, armorMax: 4 },
    'daggerheart:thresholds': { evasion: 12, major: 10, severe: 22 },
    'daggerheart:experiences': {
      items: [
        { name: '森林生存专家', modifier: 2 },
        { name: '铁匠学徒', modifier: 1 },
      ],
    },
  },
}

function makeAttrs() {
  return { agility: 2, strength: -1, finesse: 0, instinct: 3, presence: 1, knowledge: -2 }
}

function makeMeta() {
  return { tier: 2, proficiency: 2, className: 'Bard', ancestry: 'Elf' }
}

function makeHealth() {
  return { current: 15, max: 20 }
}

function makeStress() {
  return { current: 2, max: 6 }
}

function makeExtras() {
  return { hope: 3, hopeMax: 6, armor: 2, armorMax: 4 }
}

function makeThresholds() {
  return { evasion: 12, major: 10, severe: 22 }
}

function makeExperiences() {
  return {
    items: [
      { name: '森林生存专家', modifier: 2 },
      { name: '铁匠学徒', modifier: 1 },
    ],
  }
}

function makeMockSdk(overrides: Partial<{ role: 'GM' | 'Player' }> = {}) {
  return {
    data: {
      useEntity: vi.fn().mockImplementation((id: string) => (id ? TEST_ENTITY : undefined)),
      useComponent: vi.fn().mockImplementation((_id: string, key: string) => {
        if (key === 'daggerheart:attributes') return makeAttrs()
        if (key === 'daggerheart:meta') return makeMeta()
        if (key === 'daggerheart:health') return makeHealth()
        if (key === 'daggerheart:stress') return makeStress()
        if (key === 'daggerheart:extras') return makeExtras()
        if (key === 'daggerheart:thresholds') return makeThresholds()
        if (key === 'daggerheart:experiences') return makeExperiences()
        return undefined
      }),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zustand selector signature
  vi.mocked(identityModule.useIdentityStore).mockImplementation((selector: any) => {
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
    }
    return selector(state)
  })
}

/** Hover over the card root to expand it */
async function expandCard(user: ReturnType<typeof userEvent.setup>) {
  await user.hover(screen.getByTestId('charcard-handle'))
}

describe('CharacterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupIdentityStore('char1')
  })

  describe('collapsed state', () => {
    it('starts collapsed with character initial in tab handle', () => {
      render(<CharacterCard sdk={makeMockSdk()} />)
      const root = screen.getByTestId('charcard-handle')
      expect(root).toBeInTheDocument()
      expect(root).toHaveTextContent('A') // "Aria" initial
      expect(screen.queryByTestId('charcard')).not.toBeInTheDocument()
    })

    it('does not resize on mount (default region size matches collapsed)', () => {
      render(<CharacterCard sdk={makeMockSdk()} />)
      expect(mockResize).not.toHaveBeenCalled()
    })
  })

  describe('expanded state', () => {
    it('expands on handle click and resizes region', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      expect(screen.getByTestId('charcard')).toBeInTheDocument()
      expect(mockResize).toHaveBeenCalledWith({ width: 300, height: 480 })
    })

    it('renders 6 attribute cells with correct values', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      const values = screen.getAllByTestId('attr-value')
      expect(values).toHaveLength(6)
      const texts = values.map((v) => v.textContent)
      expect(texts).toContain('+2')
      expect(texts).toContain('-1')
      expect(texts).toContain('+0')
    })

    it('shows character name and class info', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      expect(screen.getByText('Aria')).toBeInTheDocument()
      expect(screen.getByText(/Bard/)).toBeInTheDocument()
    })

    it('clicking roll zone triggers action-check workflow', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      const rollZones = screen.getAllByTestId('attr-roll-zone')
      await user.click(rollZones[0]!)
      expect(mockRunWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'daggerheart-core:action-check' }),
        expect.objectContaining({
          formula: '2d12+@agility',
          actorId: 'char1',
        }),
      )
    })

    it('clicking edit zone opens input', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      const editZones = screen.getAllByTestId('attr-edit-zone')
      await user.click(editZones[0]!)
      expect(screen.getByTestId('attr-input')).toBeInTheDocument()
    })

    it('submitting edit triggers update-attr workflow', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      const editZones = screen.getAllByTestId('attr-edit-zone')
      await user.click(editZones[0]!)
      const input = screen.getByTestId('attr-input')
      await user.clear(input)
      await user.type(input, '5')
      await user.tab()
      expect(mockRunWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'daggerheart-core:charcard-update-attr' }),
        expect.objectContaining({
          entityId: 'char1',
          attribute: 'agility',
          value: 5,
        }),
      )
    })

    it('renders resource bars for HP and stress', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      const bars = screen.getAllByTestId('res-bar')
      expect(bars).toHaveLength(2)
      const texts = screen.getAllByTestId('res-text')
      expect(texts[0]).toHaveTextContent('15/20')
      expect(texts[1]).toHaveTextContent('2/6')
    })

    it('renders pip rows for armor and hope', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      const pipRows = screen.getAllByTestId('pip-row')
      expect(pipRows).toHaveLength(2)
      const pips = screen.getAllByTestId('pip')
      // armor: 4 pips (armorMax=4), hope: 6 pips (hopeMax=6)
      expect(pips).toHaveLength(10)
    })

    it('renders threshold values', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      const thresholdValues = screen.getAllByTestId('threshold-value')
      expect(thresholdValues).toHaveLength(3)
      expect(thresholdValues[0]).toHaveTextContent('12')
      expect(thresholdValues[1]).toHaveTextContent('10')
      expect(thresholdValues[2]).toHaveTextContent('22')
    })

    it('renders experience items', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      const expItems = screen.getAllByTestId('exp-item')
      expect(expItems).toHaveLength(2)
      expect(screen.getByText('森林生存专家')).toBeInTheDocument()
      expect(screen.getByText('铁匠学徒')).toBeInTheDocument()
    })

    it('clicking resource +/- buttons triggers update workflow', async () => {
      const user = userEvent.setup()
      render(<CharacterCard sdk={makeMockSdk()} />)
      await expandCard(user)
      const incButtons = screen.getAllByTestId('res-inc')
      await user.click(incButtons[0]!) // HP increment
      expect(mockRunWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'daggerheart-core:charcard-update-res' }),
        expect.objectContaining({
          entityId: 'char1',
          resource: 'health',
          field: 'current',
          value: 16,
        }),
      )
    })
  })

  it('GM role renders hidden div', () => {
    render(<CharacterCard sdk={makeMockSdk({ role: 'GM' })} />)
    expect(screen.getByTestId('charcard-gm-hidden')).toBeInTheDocument()
    expect(screen.queryByTestId('charcard-handle')).not.toBeInTheDocument()
  })

  it('no active character shows empty state after hovering', async () => {
    setupIdentityStore(null)
    const user = userEvent.setup()
    render(<CharacterCard sdk={makeMockSdk()} />)
    // Handle shows "?" when no character
    expect(screen.getByTestId('charcard-handle')).toHaveTextContent('?')
    await expandCard(user)
    expect(screen.getByTestId('charcard-empty')).toBeInTheDocument()
    expect(screen.getByText('No character selected')).toBeInTheDocument()
  })
})
